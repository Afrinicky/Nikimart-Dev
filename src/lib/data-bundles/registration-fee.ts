import "server-only";
import { prisma } from "@/lib/prisma";
import { dataDb } from "@/lib/data-db";
import { notify } from "@/lib/notifications";
import { initializeTransaction, isPaymentConfigured, toPesewas, verifyTransaction } from "@/lib/payments";
import { callbackOrigin } from "@/lib/site";
import { formatMoney } from "@/lib/format";
import { REGISTRATION_REFERENCE_PREFIX } from "@/lib/data-bundles/reference";
import { registrationOutstanding } from "@/lib/data-bundles/referral-rules";
import { round2 } from "@/lib/data-bundles/agent-pricing";
import { DuplicateLedgerEntryError, postLedgerEntry } from "@/lib/data-bundles/agent-ledger";
import { releaseReferralRewards } from "@/lib/data-bundles/referrals";
import { issueAgentCredentials } from "@/lib/data-bundles/agent-credentials";
import { recordNotification } from "@/lib/data-bundles/notifications";

/**
 * Paying the registration fee up front.
 *
 * An applicant chooses between two ways of settling it, and both end in the
 * same place — a fee that has actually been paid, which is what releases their
 * recruiter's referral reward:
 *
 *   BALANCE — the fee is debited on approval and the account opens negative.
 *             It clears itself out of commission, so there is nothing to pay
 *             before they start. This is the original arrangement.
 *   UPFRONT — the same debit is posted, and the agent pays it off here through
 *             Paystack. The payment posts a matching credit, which brings them
 *             back to zero.
 *
 * Posting a debit and a credit rather than flipping a flag is deliberate: the
 * wallet then shows what was charged and what was paid, in two lines anybody
 * can reconcile, instead of a balance that silently starts at zero for some
 * agents and below it for others.
 */

export function newRegistrationReference(): string {
  return `${REGISTRATION_REFERENCE_PREFIX}${Date.now().toString(36).toUpperCase()}${Math.floor(Math.random() * 900 + 100)}`;
}

export interface RegistrationFeeStatus {
  /** The fee this agent was charged. */
  amount: number;
  /** How they chose to settle it. */
  method: string;
  paid: boolean;
  /** True when there is a payment for them to make right now. */
  payable: boolean;
  /** What is still outstanding, for the "pay this" button. */
  outstanding: number;
}

export function registrationFeeStatus(agent: {
  setupFee: number;
  setupFeeMethod: string;
  setupFeePaidAt: Date | null;
  balance: number;
}): RegistrationFeeStatus {
  const paid = Boolean(agent.setupFeePaidAt);
  const outstanding = registrationOutstanding(agent.balance, agent.setupFee, agent.setupFeePaidAt);
  return {
    amount: round2(agent.setupFee),
    method: agent.setupFeeMethod,
    paid,
    // Only an upfront agent is asked to pay: on BALANCE the fee is clearing
    // itself and asking for money would contradict what they were promised.
    payable: !paid && agent.setupFeeMethod === "UPFRONT" && outstanding > 0,
    outstanding,
  };
}

export type StartPaymentResult =
  | { ok: true; reference: string; authorizationUrl?: string }
  | { ok: false; error: string };

/**
 * Begin a registration-fee payment for one agent.
 *
 * A fresh reference each time, because Paystack will not reissue one it has
 * already seen. That would normally risk an agent paying an abandoned link and
 * the settlement not knowing whose money it was, so the agent id travels in the
 * transaction metadata and settlement reads it from there rather than from a
 * reference stored on the row. Whatever link they end up paying, it settles.
 */
export async function startRegistrationFeePayment(
  agent: { id: string; code: string; storeName: string; setupFee: number; setupFeeMethod: string; setupFeePaidAt: Date | null; balance: number },
  email: string,
): Promise<StartPaymentResult> {
  const status = registrationFeeStatus(agent);
  if (status.paid) return { ok: false, error: "Your registration fee is already paid." };
  if (status.outstanding <= 0) {
    return { ok: false, error: "There is nothing outstanding on your registration fee." };
  }

  const reference = newRegistrationReference();
  await dataDb.dataAgent
    .updateMany({
      where: { id: agent.id, setupFeePaidAt: null },
      data: { setupFeeReference: reference },
    })
    .catch(() => ({ count: 0 }));

  if (!isPaymentConfigured("data")) {
    // No Paystack keys (local dev / preview): settle it directly so the rest of
    // the flow — the reward it releases — stays exercisable end to end.
    await settleRegistrationFee(agent.id, reference);
    return { ok: true, reference };
  }

  try {
    const { authorizationUrl } = await initializeTransaction(
      {
        email,
        amountPesewas: toPesewas(status.outstanding),
        reference,
        callbackUrl: `${callbackOrigin()}/agent/verify`,
        metadata: {
          kind: "agent-registration-fee",
          agentId: agent.id,
          agentCode: agent.code,
          storeName: agent.storeName,
        },
      },
      "data",
    );
    return { ok: true, reference, authorizationUrl };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Could not start the payment. Please try again.",
    };
  }
}

/**
 * Settle a paid registration fee — once.
 *
 * `agentId` comes from the transaction metadata where the caller has it (the
 * webhook, the verify page); otherwise the reference stored on the agent is
 * used. The ledger's dedupe key is derived from the agent, not the reference,
 * so even two different references for the same agent credit them only once.
 */
export async function settleRegistrationFee(
  agentId: string | null,
  reference: string,
): Promise<boolean> {
  const agent = agentId
    ? await dataDb.dataAgent.findUnique({ where: { id: agentId } }).catch(() => null)
    : await dataDb.dataAgent.findFirst({ where: { setupFeeReference: reference } }).catch(() => null);
  if (!agent) return false;
  if (agent.setupFeePaidAt) return true; // already settled
  if (agent.setupFee <= 0) return false;

  const owed = registrationOutstanding(agent.balance, agent.setupFee, agent.setupFeePaidAt);

  try {
    if (owed > 0) {
      await postLedgerEntry({
        agentId: agent.id,
        type: "SETUP_FEE_PAYMENT",
        amount: owed,
        narration: `Registration fee paid — ${formatMoney(owed)} (ref ${reference})`,
        reference,
        dedupeKey: `SETUP_FEE_PAYMENT:${agent.id}`,
      });
    }
  } catch (err) {
    // Already credited by a racing caller. The stamp below is still worth
    // doing — it is what releases the reward — and is itself guarded.
    if (!(err instanceof DuplicateLedgerEntryError)) return false;
  }

  await dataDb.dataAgent
    .updateMany({
      where: { id: agent.id, setupFeePaidAt: null },
      // Stamped PAYMENT here and nowhere else: this is the one path money
      // actually travelled down, and it is what separates a fee that was paid
      // from one an admin cleared off the balance by hand.
      data: { setupFeePaidAt: new Date(), setupFeeReference: reference, setupFeeSettledBy: "PAYMENT" },
    })
    .catch(() => {});

  // The whole point of the fee: paying it is what makes the recruiter's reward
  // payable.
  await releaseReferralRewards(agent.id);
  return true;
}

/** Confirm a captured amount covers what the agent still owes. */
export async function registrationPaymentCovers(
  reference: string,
  amountPesewas: number,
  agentId?: string | null,
): Promise<boolean> {
  const agent = agentId
    ? await dataDb.dataAgent.findUnique({ where: { id: agentId } }).catch(() => null)
    : await dataDb.dataAgent.findFirst({ where: { setupFeeReference: reference } }).catch(() => null);
  if (!agent) return false;
  if (agent.setupFeePaidAt) return true;
  const owed = registrationOutstanding(agent.balance, agent.setupFee, agent.setupFeePaidAt);
  // One pesewa of tolerance absorbs rounding between our total and the
  // gateway's integer amount.
  return amountPesewas + 1 >= toPesewas(owed);
}

/** The agent id a registration transaction carries, if it carries one. */
export function agentIdFromMetadata(metadata: unknown): string | null {
  if (typeof metadata !== "object" || metadata === null) return null;
  const value = (metadata as Record<string, unknown>).agentId;
  return typeof value === "string" && value ? value : null;
}

/**
 * Verify a registration payment with Paystack and settle it. Used by the
 * redirect the agent lands on; the webhook settles independently.
 */
export async function verifyAndSettleRegistrationFee(reference: string): Promise<boolean> {
  const result = await verifyTransaction(reference, "data");
  if (!result.paid || result.currency !== "GHS") return false;
  const agentId = agentIdFromMetadata(result.metadata);
  if (!(await registrationPaymentCovers(reference, result.amountPesewas, agentId))) return false;
  return settleRegistrationFee(agentId, reference);
}

// ---------------------------------------------------------------------------
// Paying at signup, before the account exists
// ---------------------------------------------------------------------------

/**
 * The same fee, collected one step earlier.
 *
 * When the programme collects up front, "up front" has to mean before there is
 * anything to collect against: an applicant who is approved and only then asked
 * to pay is an approved agent who may never pay, and the store was already
 * open. So the payment happens on the signup form, against the application,
 * and approval is simply not offered until the money is in.
 *
 * There is no agent row yet, so these mirror the functions above against
 * `DataAgentApplication` instead. The ledger pair is still posted — on the
 * agent, at approval — so the wallet reads the same either way: a debit for
 * what was charged and a credit for what was paid.
 */

/** The application id a signup transaction carries, if it carries one. */
export function applicationIdFromMetadata(metadata: unknown): string | null {
  if (typeof metadata !== "object" || metadata === null) return null;
  const value = (metadata as Record<string, unknown>).applicationId;
  return typeof value === "string" && value ? value : null;
}

/**
 * Begin the registration payment for one application.
 *
 * With no Paystack keys configured (local dev, preview) the application is
 * marked paid directly, so the flow this gates — approval, activation, the
 * recruiter's reward — stays exercisable end to end without a gateway.
 */
export async function startApplicationFeePayment(
  application: {
    id: string;
    email: string;
    fullName: string;
    feeAmount: number;
  },
  /**
   * Where Paystack returns the payer. The public signup's own confirmation by
   * default; an agent paying for somebody they have just registered is sent
   * back into their console instead, because dropping them on a public page is
   * how the old flow lost people.
   */
  callbackPath = "/become-an-agent/verify",
): Promise<StartPaymentResult> {
  if (application.feeAmount <= 0) {
    return { ok: false, error: "There is nothing to pay on this application." };
  }

  const reference = newRegistrationReference();
  await dataDb.dataAgentApplication
    .updateMany({
      where: { id: application.id, feePaidAt: null },
      data: { feeReference: reference, paymentStatus: "pending" },
    })
    .catch(() => ({ count: 0 }));

  if (!isPaymentConfigured("data")) {
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
          kind: "agent-application-fee",
          applicationId: application.id,
          applicantName: application.fullName,
        },
      },
      "data",
    );
    return { ok: true, reference, authorizationUrl };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Could not start the payment. Please try again.",
    };
  }
}

/** Confirm a captured amount covers what this application was quoted. */
export async function applicationPaymentCovers(
  reference: string,
  amountPesewas: number,
  applicationId?: string | null,
): Promise<boolean> {
  const application = await findApplicationForPayment(applicationId, reference);
  if (!application) return false;
  if (application.feePaidAt) return true;
  // One pesewa of tolerance, as elsewhere, for the rounding between our total
  // and the gateway's integer amount.
  return amountPesewas + 1 >= toPesewas(application.feeAmount);
}

/** Mark an application's registration fee as paid — once. */
export async function settleApplicationFee(
  applicationId: string | null,
  reference: string,
): Promise<boolean> {
  const application = await findApplicationForPayment(applicationId, reference);
  if (!application) return false;
  if (application.feePaidAt) return true;

  const updated = await dataDb.dataAgentApplication
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
  await notifyAdminsOfPayment(application.id, application.fullName, application.desiredSlug);

  // And this is when somebody an agent registered gets their sign-in details.
  // Not when the checkout opened — a registration nobody paid for must not put
  // a working password in an inbox. Does nothing for a public signup, where the
  // applicant chose their own password.
  await issueAgentCredentials(application.id);
  return true;
}

async function notifyAdminsOfPayment(
  id: string,
  fullName: string,
  slug: string,
): Promise<void> {
  await recordNotification({
    kind: "REGISTRATION",
    tone: "success",
    title: `${fullName} paid their agent registration`,
    body: `Store “${slug}”. They are waiting on approval.`,
    href: "/admin/data/agents/applications",
    dedupeKey: `REGISTRATION:${id}`,
  });
  try {
    const admins = await prisma.user.findMany({
      where: { role: "ADMIN" },
      select: { phone: true, email: true },
    });
    await Promise.allSettled(
      admins.map((a) =>
        notify(a, {
          sms: `Nickimart: ${fullName} has paid their agent registration (store “${slug}”) and is waiting for approval.`,
          emailSubject: "Agent registration paid — awaiting approval",
        }),
      ),
    );
  } catch {
    // The payment is settled; telling the admins is not worth failing for.
  }
}

async function findApplicationForPayment(applicationId: string | null | undefined, reference: string) {
  return applicationId
    ? await dataDb.dataAgentApplication.findUnique({ where: { id: applicationId } }).catch(() => null)
    : await dataDb.dataAgentApplication
        .findFirst({ where: { feeReference: reference } })
        .catch(() => null);
}

/** Verify a signup payment with Paystack and settle it. Used by the redirect. */
export async function verifyAndSettleApplicationFee(reference: string): Promise<boolean> {
  const result = await verifyTransaction(reference, "data");
  if (!result.paid || result.currency !== "GHS") return false;
  const applicationId = applicationIdFromMetadata(result.metadata);
  if (!(await applicationPaymentCovers(reference, result.amountPesewas, applicationId))) return false;
  return settleApplicationFee(applicationId, reference);
}

// ---------------------------------------------------------------------------
// One door for the webhook
// ---------------------------------------------------------------------------

/**
 * Both kinds of registration charge share the "NR-" prefix, because they are
 * the same fee paid at two different moments. Which one this is comes from the
 * transaction's own metadata — an application id, or an agent id — so the
 * webhook asks these two rather than deciding for itself.
 */
export async function registrationChargeCovers(
  reference: string,
  amountPesewas: number,
  metadata: unknown,
): Promise<boolean> {
  const applicationId = applicationIdFromMetadata(metadata);
  if (applicationId) return applicationPaymentCovers(reference, amountPesewas, applicationId);
  const agentId = agentIdFromMetadata(metadata);
  if (agentId) return registrationPaymentCovers(reference, amountPesewas, agentId);
  // No metadata to go on — an older link, or one Paystack replayed without it.
  // Try both by reference; an application and an agent can never share one.
  return (
    (await applicationPaymentCovers(reference, amountPesewas, null)) ||
    (await registrationPaymentCovers(reference, amountPesewas, null))
  );
}

export async function settleRegistrationCharge(
  reference: string,
  metadata: unknown,
): Promise<boolean> {
  const applicationId = applicationIdFromMetadata(metadata);
  if (applicationId) return settleApplicationFee(applicationId, reference);
  const agentId = agentIdFromMetadata(metadata);
  if (agentId) return settleRegistrationFee(agentId, reference);
  return (
    (await settleApplicationFee(null, reference)) || (await settleRegistrationFee(null, reference))
  );
}
