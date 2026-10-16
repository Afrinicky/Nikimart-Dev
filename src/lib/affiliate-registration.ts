import "server-only";
import { prisma } from "@/lib/prisma";
import { notify } from "@/lib/notifications";
import {
  initializeTransaction,
  isPaymentConfigured,
  toPesewas,
  verifyTransaction,
} from "@/lib/payments";
import { callbackOrigin } from "@/lib/site";
import { AFFILIATE_REFERENCE_PREFIX } from "@/lib/affiliate-reference";
import { getAffiliatePolicy, getAffiliateReferralConfig } from "@/lib/affiliate-settings";
import { resolveAffiliateInvite } from "@/lib/affiliate-invites";
import { linkReferral, releaseJoiningRewards, resolveReferralCode } from "@/lib/affiliate-team";
import {
  applyToRegistration,
  registrationQuote,
  settlementSource,
  sharePercentFor,
  waiverPercentFor,
  type RegistrationQuote,
} from "@/lib/affiliate-team-rules";
import {
  inviteProblemMessage,
  inviteWaiverPercent,
  normaliseInviteCode,
} from "@/lib/data-bundles/invite-rules";
import { settleMethodFor, type PaymentMode } from "@/lib/data-bundles/payment-mode";

/**
 * What it costs to become an affiliate, and how that is collected.
 *
 * The programme was free, and for most platforms it should stay that way — the
 * fee defaults to zero, and everything here then quietly does nothing. What it
 * exists for is the arrangement the bundle agents already have: a fee with a
 * waiver on it, a recruiter who keeps a share of what their recruits pay, and a
 * joining reward that is released only once the money has actually arrived.
 *
 * Two moments can collect it:
 *
 *   UPFRONT    — on the signup form, against the application, before there is
 *                an affiliate at all. An applicant who is approved and only
 *                then asked to pay is an approved affiliate who may never pay.
 *   COMMISSION — carried as an amount owed on the affiliate's row and paid
 *                down out of the first commissions that clear.
 *
 * Both end in the same place: `registrationPaidAt` set, `registrationSettledBy`
 * recording who actually settled it, and the recruiter's reward released. The
 * distinction between a fee that was paid and one an admin wrote off is kept
 * because only the first may pay anybody a reward.
 */

function money(value: number): number {
  return Math.round(value * 100) / 100;
}

export function newAffiliateRegistrationReference(): string {
  return `${AFFILIATE_REFERENCE_PREFIX}${Date.now().toString(36).toUpperCase()}${Math.floor(
    Math.random() * 900 + 100,
  )}`;
}

// ---------------------------------------------------------------------------
// Quoting
// ---------------------------------------------------------------------------

export interface RegistrationOffer {
  /** Every part of the fee. The parts always add up to the gross. */
  quote: RegistrationQuote;
  /** How it may be settled. */
  mode: PaymentMode;
  /** Who recruited them, when a code resolved to somebody. */
  referrer: { id: string; name: string; code: string } | null;
  /** The code as typed, so a mistyped one can be shown back. */
  referralCode: string;
  /** Why a referral code was not honoured. */
  referralProblem: string;
  /** The admin link they arrived through. */
  invite: { id: string; code: string; label: string; waiverPercent: number } | null;
  /** Why an invite code was not honoured. */
  inviteProblem: string;
}

/**
 * Price one registration, before anybody has signed anything.
 *
 * The same function the form quotes from and the approval commits, because
 * quoting one number to an applicant and charging them another is the worst
 * thing this feature could do.
 */
export async function quoteAffiliateRegistration(input: {
  referralCode?: string | null;
  inviteCode?: string | null;
}): Promise<RegistrationOffer> {
  const [policy, config] = await Promise.all([
    getAffiliatePolicy(),
    getAffiliateReferralConfig(),
  ]);

  const typedRef = (input.referralCode ?? "").trim();
  let referrer: RegistrationOffer["referrer"] = null;
  let referralProblem = "";
  let waiverPercent = 0;
  let sharePercent = 0;

  if (typedRef && config.enabled) {
    const found = await resolveReferralCode(typedRef);
    if (found.ok) {
      referrer = found.affiliate;
      const row = await prisma.affiliate
        .findUnique({
          where: { id: found.affiliate.id },
          select: { referralWaiverPercent: true, referralSharePercent: true },
        })
        .catch(() => null);
      waiverPercent = waiverPercentFor(row?.referralWaiverPercent, config.waiverDefaultPercent);
      sharePercent = sharePercentFor(row?.referralSharePercent, config.referrerSharePercent);
    } else {
      referralProblem = found.reason;
    }
  }

  const typedInvite = normaliseInviteCode(input.inviteCode);
  let invite: RegistrationOffer["invite"] = null;
  let problemText = "";
  if (typedInvite) {
    const found = await resolveAffiliateInvite(typedInvite);
    if (found.ok) {
      invite = {
        id: found.invite.id,
        code: found.invite.code,
        label: found.invite.label,
        waiverPercent: found.invite.waiverPercent,
      };
    } else if (found.problem !== "unknown") {
      problemText = inviteProblemMessage(found.problem);
    }
  }

  const quote = registrationQuote({
    fee: policy.registrationFee,
    waiverPercent,
    referrerSharePercent: sharePercent,
    hasReferrer: Boolean(referrer),
    inviteWaiverPercent: inviteWaiverPercent(
      invite ? { ...invite, maxUses: 0, usedCount: 0, expiresAt: null, isActive: true } : null,
    ),
  });

  return {
    quote,
    mode: policy.registrationPaymentMode,
    referrer,
    referralCode: typedRef,
    referralProblem,
    invite,
    inviteProblem: problemText,
  };
}

/** Which of the two ways this fee will actually be settled. */
export function settlementMethodFor(
  offer: RegistrationOffer,
  chosen: string | null | undefined,
): "UPFRONT" | "COMMISSION" | "WAIVED" {
  if (offer.quote.payable <= 0) return "WAIVED";
  return settleMethodFor(offer.mode, chosen, offer.quote.payable) === "UPFRONT"
    ? "UPFRONT"
    : "COMMISSION";
}

// ---------------------------------------------------------------------------
// Paying at signup, before the affiliate exists
// ---------------------------------------------------------------------------

export type StartPaymentResult =
  | { ok: true; reference: string; authorizationUrl?: string }
  | { ok: false; error: string };

/** The application id a signup transaction carries, if it carries one. */
export function applicationIdFromMetadata(metadata: unknown): string | null {
  if (typeof metadata !== "object" || metadata === null) return null;
  const value = (metadata as Record<string, unknown>).applicationId;
  return typeof value === "string" && value ? value : null;
}

/** The affiliate id a registration transaction carries, if it carries one. */
export function affiliateIdFromMetadata(metadata: unknown): string | null {
  if (typeof metadata !== "object" || metadata === null) return null;
  const value = (metadata as Record<string, unknown>).affiliateId;
  return typeof value === "string" && value ? value : null;
}

/**
 * Begin the registration payment for one application.
 *
 * A fresh reference each time, because Paystack will not reissue one it has
 * already seen — so the application id travels in the metadata and settlement
 * reads it from there rather than from the reference on the row. Whichever link
 * they end up paying, it settles.
 *
 * With no Paystack keys configured (local dev, preview) the application is
 * marked paid directly, so everything this gates — approval, the recruiter's
 * reward — stays exercisable end to end without a gateway.
 */
export async function startApplicationFeePayment(
  application: { id: string; email: string; fullName: string; feeAmount: number },
  callbackPath = "/become-an-affiliate/verify",
): Promise<StartPaymentResult> {
  if (application.feeAmount <= 0) {
    return { ok: false, error: "There is nothing to pay on this application." };
  }

  const reference = newAffiliateRegistrationReference();
  await prisma.affiliateApplication
    .updateMany({
      where: { id: application.id, feePaidAt: null },
      data: { feeReference: reference, paymentStatus: "pending" },
    })
    .catch(() => ({ count: 0 }));

  if (!isPaymentConfigured("retail")) {
    await settleApplicationFee(application.id, reference);
    return { ok: true, reference };
  }

  try {
    const { authorizationUrl } = await initializeTransaction(
      {
        email: application.email,
        amountPesewas: toPesewas(application.feeAmount),
        reference,
        callbackUrl: `${callbackOrigin()}${callbackPath}`,
        metadata: {
          kind: "affiliate-application-fee",
          applicationId: application.id,
          applicantName: application.fullName,
        },
      },
      "retail",
    );
    return { ok: true, reference, authorizationUrl };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Could not start the payment. Please try again.",
    };
  }
}

async function findApplication(applicationId: string | null | undefined, reference: string) {
  return applicationId
    ? await prisma.affiliateApplication.findUnique({ where: { id: applicationId } }).catch(() => null)
    : await prisma.affiliateApplication
        .findFirst({ where: { feeReference: reference } })
        .catch(() => null);
}

/** Confirm a captured amount covers what this application was quoted. */
export async function applicationFeeCovers(
  reference: string,
  amountPesewas: number,
  applicationId?: string | null,
): Promise<boolean> {
  const application = await findApplication(applicationId, reference);
  if (!application) return false;
  if (application.feePaidAt) return true;
  // One pesewa of tolerance absorbs the rounding between our total and the
  // gateway's integer amount.
  return amountPesewas + 1 >= toPesewas(application.feeAmount);
}

/** Mark an application's registration fee as paid — once. */
export async function settleApplicationFee(
  applicationId: string | null,
  reference: string,
): Promise<boolean> {
  const application = await findApplication(applicationId, reference);
  if (!application) return false;
  if (application.feePaidAt) return true;

  const updated = await prisma.affiliateApplication
    .updateMany({
      where: { id: application.id, feePaidAt: null },
      data: { paymentStatus: "paid", feePaidAt: new Date(), feeReference: reference },
    })
    .catch(() => ({ count: 0 }));
  if (updated.count === 0) return false;

  // This, not the form submit, is when a paying applicant joins the queue: the
  // signup hands them to Paystack and never comes back to our own code, so
  // without a nudge here a paid application would sit unreviewed until somebody
  // happened to look. Guarded by the update above, so a webhook and a redirect
  // arriving together still send one message.
  await tellAdmins(application.fullName);
  return true;
}

async function tellAdmins(fullName: string): Promise<void> {
  try {
    const admins = await prisma.user.findMany({
      where: { role: "ADMIN" },
      select: { phone: true, email: true },
    });
    await Promise.allSettled(
      admins.map((a) =>
        notify(a, {
          sms: `Nickimart: ${fullName} has paid their affiliate registration and is waiting for approval.`,
          emailSubject: "Affiliate registration paid — awaiting approval",
        }),
      ),
    );
  } catch {
    // The payment is settled; telling the admins is not worth failing for.
  }
}

/** Verify a signup payment with Paystack and settle it. Used by the redirect. */
export async function verifyAndSettleApplicationFee(reference: string): Promise<boolean> {
  const result = await verifyTransaction(reference, "retail");
  if (!result.paid || result.currency !== "GHS") return false;
  const applicationId = applicationIdFromMetadata(result.metadata);
  if (!(await applicationFeeCovers(reference, result.amountPesewas, applicationId))) return false;
  return settleApplicationFee(applicationId, reference);
}

// ---------------------------------------------------------------------------
// Committing the quote onto the affiliate
// ---------------------------------------------------------------------------

/**
 * Write what an application was quoted onto the affiliate it became.
 *
 * Called from approval, once, and recorded on the row rather than recomputed:
 * a fee change next month must never rewrite what this registration was. The
 * referral is locked here too, which is what makes it permanent.
 */
export async function commitRegistrationOnApproval(input: {
  affiliateId: string;
  application: {
    referredById: string | null;
    inviteId: string | null;
    feeGross: number;
    feeWaiverPercent: number;
    feeWaived: number;
    feeAmount: number;
    feeReferrerShare: number;
    feeMethod: string;
    feePaidAt: Date | null;
    feeReference: string | null;
  };
}): Promise<void> {
  const { affiliateId, application } = input;
  const paidUpFront = Boolean(application.feePaidAt);
  const waived = application.feeAmount <= 0;

  await prisma.affiliate
    .update({
      where: { id: affiliateId },
      data: {
        registrationGross: application.feeGross,
        registrationWaiverPercent: application.feeWaiverPercent,
        registrationWaived: application.feeWaived,
        registrationFee: application.feeAmount,
        registrationReferrerShare: application.feeReferrerShare,
        registrationMethod: waived ? "WAIVED" : application.feeMethod,
        registrationReference: application.feeReference,
        // Paid at signup, or nothing to pay: either way it is settled now.
        // Otherwise it is owed, and the first commissions that clear pay it.
        registrationPaidAt: paidUpFront || waived ? (application.feePaidAt ?? new Date()) : null,
        registrationSettledBy: paidUpFront ? "PAYMENT" : waived ? "WAIVED" : null,
        registrationOwed: paidUpFront || waived ? 0 : application.feeAmount,
        inviteId: application.inviteId,
      },
    })
    .catch(() => {});

  if (application.referredById) await linkReferral(affiliateId, application.referredById);

  // A fee already paid releases the recruiter's reward the moment the
  // relationship exists — which is now, and not before.
  if (paidUpFront || waived) await releaseJoiningRewards(affiliateId);
}

// ---------------------------------------------------------------------------
// An affiliate who already owes
// ---------------------------------------------------------------------------

export interface RegistrationStatus {
  /** The fee they were charged. */
  amount: number;
  method: string;
  paid: boolean;
  /** What is still outstanding. */
  outstanding: number;
  /** True when there is a payment for them to make right now. */
  payable: boolean;
}

export function registrationStatus(affiliate: {
  registrationFee: number;
  registrationMethod: string;
  registrationPaidAt: Date | null;
  registrationOwed: number;
}): RegistrationStatus {
  const paid = Boolean(affiliate.registrationPaidAt);
  const outstanding = paid ? 0 : money(Math.max(0, affiliate.registrationOwed));
  return {
    amount: money(affiliate.registrationFee),
    method: affiliate.registrationMethod,
    paid,
    outstanding,
    // Anybody who owes may settle it early. Somebody promised it would clear
    // out of commission is never *asked* to pay — the screen offers it, which
    // is a different thing.
    payable: !paid && outstanding > 0,
  };
}

/** Begin a registration-fee payment for an affiliate who still owes. */
export async function startAffiliateFeePayment(
  affiliate: {
    id: string;
    name: string;
    registrationFee: number;
    registrationMethod: string;
    registrationPaidAt: Date | null;
    registrationOwed: number;
  },
  email: string,
): Promise<StartPaymentResult> {
  const status = registrationStatus(affiliate);
  if (status.paid) return { ok: false, error: "Your registration fee is already paid." };
  if (status.outstanding <= 0) {
    return { ok: false, error: "There is nothing outstanding on your registration fee." };
  }

  const reference = newAffiliateRegistrationReference();
  await prisma.affiliate
    .updateMany({
      where: { id: affiliate.id, registrationPaidAt: null },
      data: { registrationReference: reference },
    })
    .catch(() => ({ count: 0 }));

  if (!isPaymentConfigured("retail")) {
    await settleAffiliateFee(affiliate.id, reference);
    return { ok: true, reference };
  }

  try {
    const { authorizationUrl } = await initializeTransaction(
      {
        email,
        amountPesewas: toPesewas(status.outstanding),
        reference,
        callbackUrl: `${callbackOrigin()}/affiliate/team/verify`,
        metadata: {
          kind: "affiliate-registration-fee",
          affiliateId: affiliate.id,
          affiliateName: affiliate.name,
        },
      },
      "retail",
    );
    return { ok: true, reference, authorizationUrl };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Could not start the payment. Please try again.",
    };
  }
}

/** Confirm a captured amount covers what this affiliate still owes. */
export async function affiliateFeeCovers(
  reference: string,
  amountPesewas: number,
  affiliateId?: string | null,
): Promise<boolean> {
  const affiliate = affiliateId
    ? await prisma.affiliate.findUnique({ where: { id: affiliateId } }).catch(() => null)
    : await prisma.affiliate.findFirst({ where: { registrationReference: reference } }).catch(() => null);
  if (!affiliate) return false;
  if (affiliate.registrationPaidAt) return true;
  return amountPesewas + 1 >= toPesewas(Math.max(0, affiliate.registrationOwed));
}

/** Settle a paid registration fee — once. */
export async function settleAffiliateFee(
  affiliateId: string | null,
  reference: string,
): Promise<boolean> {
  const affiliate = affiliateId
    ? await prisma.affiliate.findUnique({ where: { id: affiliateId } }).catch(() => null)
    : await prisma.affiliate.findFirst({ where: { registrationReference: reference } }).catch(() => null);
  if (!affiliate) return false;
  if (affiliate.registrationPaidAt) return true;

  const done = await prisma.affiliate
    .updateMany({
      where: { id: affiliate.id, registrationPaidAt: null },
      // PAYMENT stamped here and nowhere else: this is the one path money
      // actually travelled down, and it is what separates a fee that was paid
      // from one an admin cleared off by hand.
      data: {
        registrationPaidAt: new Date(),
        registrationReference: reference,
        registrationSettledBy: "PAYMENT",
        registrationOwed: 0,
      },
    })
    .catch(() => ({ count: 0 }));
  if (done.count === 0) return false;

  // The whole point of the fee: paying it is what makes the recruiter's reward
  // payable.
  await releaseJoiningRewards(affiliate.id);
  return true;
}

/** Verify an affiliate's own payment with Paystack and settle it. */
export async function verifyAndSettleAffiliateFee(reference: string): Promise<boolean> {
  const result = await verifyTransaction(reference, "retail");
  if (!result.paid || result.currency !== "GHS") return false;
  const affiliateId = affiliateIdFromMetadata(result.metadata);
  if (!(await affiliateFeeCovers(reference, result.amountPesewas, affiliateId))) return false;
  return settleAffiliateFee(affiliateId, reference);
}

// ---------------------------------------------------------------------------
// Clearing it out of commission
// ---------------------------------------------------------------------------

/**
 * Pay a registration fee down out of what has cleared.
 *
 * Called wherever an affiliate's balance is read, because "it clears itself out
 * of your commission" has to be true the moment the commission clears rather
 * than when somebody remembers to run something. What is owed comes off the
 * payable balance first; whatever is left is theirs.
 *
 * A fee cleared this way settles as COMMISSION rather than PAYMENT, and both
 * release the recruiter's reward — the affiliate did pay it, out of their own
 * earnings. An admin writing it off is the one case that pays nobody, and that
 * is stamped ADJUSTMENT where it happens.
 */
export async function applyEarningsToRegistration(affiliateId: string): Promise<number> {
  try {
    const affiliate = await prisma.affiliate.findUnique({
      where: { id: affiliateId },
      select: { id: true, registrationOwed: true, registrationPaidAt: true },
    });
    if (!affiliate || affiliate.registrationPaidAt) return 0;
    const owed = money(Math.max(0, affiliate.registrationOwed));
    if (owed <= 0) return 0;

    const cleared = await prisma.affiliateCommission.aggregate({
      where: { affiliateId, status: "cleared" },
      _sum: { amount: true, reversedAmount: true },
    });
    const available = money(
      Math.max(0, (cleared._sum.amount ?? 0) - (cleared._sum.reversedAmount ?? 0)),
    );
    const { toFee, owedAfter } = applyToRegistration(available, owed);
    if (toFee <= 0) return 0;

    const settled = owedAfter <= 0;
    await prisma.affiliate
      .updateMany({
        where: { id: affiliateId, registrationPaidAt: null },
        data: {
          registrationOwed: owedAfter,
          ...(settled
            ? {
                registrationPaidAt: new Date(),
                registrationSettledBy: settlementSource({
                  // Nothing has been credited by hand against an affiliate's
                  // registration, so what cleared it is their own commission.
                  balance: available - toFee,
                  adjustmentCredits: 0,
                }),
              }
            : {}),
        },
      })
      .catch(() => {});

    if (settled) await releaseJoiningRewards(affiliateId);
    return toFee;
  } catch {
    return 0;
  }
}

// ---------------------------------------------------------------------------
// One door for the webhook
// ---------------------------------------------------------------------------

/**
 * Both kinds of affiliate registration charge share the "AF-" prefix, because
 * they are the same fee paid at two different moments. Which one this is comes
 * from the transaction's own metadata — an application id, or an affiliate id.
 */
export async function affiliateRegistrationCovers(
  reference: string,
  amountPesewas: number,
  metadata: unknown,
): Promise<boolean> {
  const applicationId = applicationIdFromMetadata(metadata);
  if (applicationId) return applicationFeeCovers(reference, amountPesewas, applicationId);
  const affiliateId = affiliateIdFromMetadata(metadata);
  if (affiliateId) return affiliateFeeCovers(reference, amountPesewas, affiliateId);
  // No metadata to go on — an older link, or one Paystack replayed without it.
  // Try both by reference; an application and an affiliate can never share one.
  return (
    (await applicationFeeCovers(reference, amountPesewas, null)) ||
    (await affiliateFeeCovers(reference, amountPesewas, null))
  );
}

export async function settleAffiliateRegistrationCharge(
  reference: string,
  metadata: unknown,
): Promise<boolean> {
  const applicationId = applicationIdFromMetadata(metadata);
  if (applicationId) return settleApplicationFee(applicationId, reference);
  const affiliateId = affiliateIdFromMetadata(metadata);
  if (affiliateId) return settleAffiliateFee(affiliateId, reference);
  return (
    (await settleApplicationFee(null, reference)) || (await settleAffiliateFee(null, reference))
  );
}
