"use server";

import { createHash } from "crypto";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { dataDb } from "@/lib/data-db";
import { requireAdmin } from "@/lib/session";
import { rateLimit, retryAfterLabel } from "@/lib/rate-limit";
import { notify, sendSms } from "@/lib/notifications";
import { siteUrl } from "@/lib/site";
import { formatMoney } from "@/lib/format";
import {
  getAgentProgramConfig,
  getReferralConfig,
  type PaymentMode,
} from "@/lib/data-bundles/settings";
import { parseGhPhone } from "@/lib/data-bundles/gh-phone";
import { termsAccepted, TERMS_REQUIRED_MESSAGE } from "@/lib/terms";
import { normaliseSlugClient } from "@/lib/data-bundles/slug";
import { postLedgerEntry } from "@/lib/data-bundles/agent-ledger";
import { generateAgentCode, slugProblem } from "@/lib/data-bundles/agents";
import { userIdForEmail } from "@/lib/data-bundles/user-link";
import {
  settleRegistrationFee,
  startApplicationFeePayment,
} from "@/lib/data-bundles/registration-fee";
import {
  checkReferralLink,
  quoteRegistrationFee,
  releaseReferralRewards,
  resolveReferralCode,
} from "@/lib/data-bundles/referrals";

/**
 * Becoming an agent, from signup to a working account.
 *
 * One form, one payment, one decision:
 *
 *   1. The applicant gives their name, contact, the store name they want and
 *      the password they will sign in with.
 *   2. If the programme collects the registration fee up front, they pay it
 *      there and then — the form hands them straight to Paystack. If it is
 *      collected from commission instead, there is nothing to pay and they go
 *      straight into the queue. Which of the two applies is the admin's
 *      setting, not the applicant's.
 *   3. An admin approves, and approval is what activates the account: the
 *      console opens, the storefront opens, and they can buy. Nothing is
 *      approvable until the money is in, so "pay to register" means what it
 *      says rather than being a bill sent to somebody already trading.
 *
 * The password is collected up front, hashed, and moved onto the account at
 * approval. That is what removes the setup link that used to sit between the
 * two — a link that had to arrive by text or email, and left an account nobody
 * could sign in to whenever it didn't. An approved agent simply signs in.
 *
 * The store slug is still a human decision: it is a public URL and the agent's
 * identity to their own customers, and Nickimart chooses who resells under its
 * name.
 */

export type ApplyState = {
  ok?: boolean;
  error?: string;
  message?: string;
  /** Shown against the acceptance box rather than at the top of the form. */
  termsError?: string;
  /** False when neither the text nor the email went out. */
  delivered?: boolean;
};

const STORAGE_ERROR =
  "Couldn't submit — the agent tables aren't set up on this database yet. " +
  "Run the Neon catch-up SQL (nikimart-neon-agent-applications.sql), then try again.";

/**
 * What to call the store.
 *
 * The name the applicant typed, which is the whole point of asking for it.
 * Applications made before that was kept have an empty string, so those fall
 * back to title-casing the slug — "nickland" becomes "Nickland", which is what
 * was asked for, rather than a name invented from the applicant.
 */
function storeNameFor(application: { storeName: string; desiredSlug: string }): string {
  const typed = application.storeName.trim();
  if (typed) return typed;
  return application.desiredSlug
    .split("-")
    .filter(Boolean)
    .map((word) => word[0].toUpperCase() + word.slice(1))
    .join(" ");
}

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/**
 * How this registration fee will actually be settled.
 *
 * The admin decides what is on offer — pay up front, clear it out of
 * commission, or let the applicant pick — and this is where that decision is
 * enforced. A fee of zero settles as neither: there is nothing to collect.
 */
function settleMethodFor(
  mode: PaymentMode,
  chosen: string | undefined,
  fee: number,
): "BALANCE" | "UPFRONT" {
  if (fee <= 0) return "BALANCE";
  if (mode === "UPFRONT") return "UPFRONT";
  if (mode === "COMMISSION") return "BALANCE";
  return chosen === "UPFRONT" ? "UPFRONT" : "BALANCE";
}

async function clientIp(): Promise<string> {
  const h = await headers();
  return (h.get("x-forwarded-for") ?? "").split(",")[0]?.trim() || "unknown";
}

// ---------------------------------------------------------------------------
// Store-name availability
// ---------------------------------------------------------------------------

export type SlugCheck =
  | { state: "idle" }
  | { state: "invalid"; message: string }
  | { state: "taken"; message: string }
  | { state: "free"; slug: string };

/**
 * Is this store name still available?
 *
 * Called as the applicant types, and again for real when they submit — a name
 * can be claimed in the seconds between. A slug is taken if any agent holds it
 * *or* any pending application has asked for it, so two applicants in the queue
 * can't both be promised the same address.
 */
export async function checkStoreName(raw: string): Promise<SlugCheck> {
  const trimmed = (raw ?? "").trim();
  if (!trimmed) return { state: "idle" };

  const slug = normaliseSlugClient(trimmed);
  const problem = slugProblem(slug);
  if (problem) return { state: "invalid", message: problem };

  // Unauthenticated and one query per call, so cap it. The allowance is
  // generous — a debounced field fires a handful of times per name — but it
  // stops the endpoint being used to walk the slug space.
  const limit = await rateLimit(`slug-check:${await clientIp()}`, 60, 5 * 60_000);
  if (!limit.ok) {
    return { state: "invalid", message: "Too many checks. Please wait a moment and try again." };
  }

  try {
    const [agent, pending] = await Promise.all([
      dataDb.dataAgent.findUnique({ where: { slug }, select: { id: true } }),
      dataDb.dataAgentApplication.findFirst({
        where: { desiredSlug: slug, status: "pending" },
        select: { id: true },
      }),
    ]);
    if (agent || pending) {
      return { state: "taken", message: `“${slug}” is already taken. Try another name.` };
    }
    return { state: "free", slug };
  } catch {
    // Tables missing — don't promise availability we can't verify.
    return { state: "invalid", message: "Couldn't check that name right now. Please try again." };
  }
}

// ---------------------------------------------------------------------------
// What it will cost to join
// ---------------------------------------------------------------------------

export interface FeeQuote {
  /** The registration fee at full price. */
  gross: number;
  /** What this applicant would actually pay. */
  payable: number;
  /** How much of the fee their recruiter's code takes off. */
  waiverPercent: number;
  /** The recruiter, when the code resolved to a live agent. */
  referrerName: string | null;
}

/**
 * Quote the registration fee for a referral code, as it is typed.
 *
 * A waiver an applicant only finds out about after they have applied does not
 * do the job it was set up to do — it is meant to be the reason they use
 * their recruiter's code rather than signing up cold. So the discount is
 * shown on the form, from the same function the approval commits, and a code
 * that resolves to nothing simply quotes the full fee.
 */
export async function quoteRegistration(rawCode: string): Promise<FeeQuote> {
  const config = await getAgentProgramConfig();
  const full: FeeQuote = {
    gross: config.setupFee,
    payable: config.setupFee,
    waiverPercent: 0,
    referrerName: null,
  };

  const code = (rawCode ?? "").trim().toUpperCase();
  if (!code) return full;

  // Unauthenticated, and one lookup per call: capped so it can't be used to
  // walk the space of agent codes.
  const limit = await rateLimit(`fee-quote:${await clientIp()}`, 60, 5 * 60_000);
  if (!limit.ok) return full;

  const resolved = await resolveReferralCode(code);
  if (!resolved.ok) return full;

  const quote = await quoteRegistrationFee(resolved.agentId);
  return {
    gross: quote.gross,
    payable: quote.payable,
    waiverPercent: quote.waiverPercent,
    referrerName: resolved.storeName,
  };
}

// ---------------------------------------------------------------------------
// Applying
// ---------------------------------------------------------------------------

const applySchema = z.object({
  firstName: z.string().trim().min(2, "Enter your first name.").max(40),
  lastName: z.string().trim().min(2, "Enter your last name.").max(40),
  phone: z.string().min(1, "Enter your phone number."),
  email: z.string().trim().email("Enter a valid email address."),
  storeName: z.string().trim().min(2, "Enter the store name you want."),
  /** The agent code of whoever recruited them. Optional — most people have none. */
  referralCode: z.string().trim().max(20).optional(),
  /**
   * How they want to settle the registration fee, where the admin lets them
   * choose. BALANCE is debited on approval and clears out of commission;
   * UPFRONT is paid on this form, before anybody reviews them.
   */
  feeMethod: z.enum(["BALANCE", "UPFRONT"]).optional(),
});

/**
 * Apply to become an agent.
 *
 * Ends in one of two places, and which one is the admin's setting rather than
 * the applicant's choice: at Paystack, when the fee is collected up front, or
 * on a "we'll be in touch" confirmation when it clears from commission instead.
 */
export async function applyToBeAgent(
  _prev: ApplyState,
  fd: FormData,
): Promise<ApplyState> {
  const config = await getAgentProgramConfig();
  if (!config.enabled) {
    return { error: "Agent signup is closed at the moment. Please check back soon." };
  }

  if (!termsAccepted(fd)) return { termsError: TERMS_REQUIRED_MESSAGE };

  // Somebody already signed in keeps the account they have: they are adding a
  // storefront to it, not opening a second one. The form doesn't ask them for a
  // password, so there is none to check here either.
  const session = await auth();
  const existingUser = session?.user?.id
    ? { id: session.user.id, email: (session.user.email ?? "").toLowerCase() }
    : null;

  const parsed = applySchema.safeParse({
    firstName: fd.get("firstName"),
    lastName: fd.get("lastName"),
    phone: fd.get("phone"),
    email: existingUser?.email || fd.get("email"),
    storeName: fd.get("storeName"),
    referralCode: fd.get("referralCode") ?? undefined,
    feeMethod: fd.get("feeMethod") ?? undefined,
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Please check the form and try again." };
  }
  const data = parsed.data;
  const fullName = `${data.firstName} ${data.lastName}`.trim();

  const password = String(fd.get("password") ?? "");
  if (!existingUser && password.length < 6) {
    return { error: "Choose a password of at least 6 characters." };
  }

  const phoneCheck = parseGhPhone(data.phone);
  if (!phoneCheck.ok) return { error: phoneCheck.message };
  const phone = phoneCheck.local;

  const email = data.email.toLowerCase();

  // Applications cost nothing to submit, so rate-limit them or the queue
  // becomes someone's plaything.
  const limit = await rateLimit(`agent-apply:${await clientIp()}`, 5, 60 * 60_000);
  if (!limit.ok) {
    return { error: `Too many applications from here. Please try again in ${retryAfterLabel(limit.retryAfter)}.` };
  }

  // Re-check the name for real: it may have gone in the seconds since the
  // browser last asked.
  const slugCheck = await checkStoreName(data.storeName);
  if (slugCheck.state === "invalid") return { error: slugCheck.message };
  if (slugCheck.state === "taken") return { error: slugCheck.message };
  if (slugCheck.state === "idle") return { error: "Enter the store name you want." };
  const desiredSlug = slugCheck.slug;

  // A referral code is optional, but a wrong one is not: someone typing their
  // recruiter's code and getting silently dropped would find out weeks later,
  // when the reward never arrived. The code is resolved now and refused if it
  // is not real — and resolved *again* at approval, because the agent it names
  // can be suspended in between.
  const referral = await getReferralConfig();
  let referrerId: string | null = null;
  const referralCode = (data.referralCode ?? "").trim().toUpperCase();
  if (referralCode) {
    if (!referral.enabled) {
      return { error: "The referral programme is closed at the moment — leave the referral code blank." };
    }
    const resolved = await resolveReferralCode(referralCode);
    if (!resolved.ok) return { error: resolved.message };
    referrerId = resolved.agentId;
  }

  // What the applicant may choose is the admin's call, not the browser's. A
  // form posting UPFRONT when the programme collects from commission — or the
  // other way round — is corrected here rather than honoured.
  const feeMethod = settleMethodFor(config.paymentMode, data.feeMethod, config.setupFee);
  // What they will actually be charged, quoted from the same function the
  // approval commits — including whatever their recruiter's code takes off.
  const quote = await quoteRegistrationFee(referrerId);
  const payNow = feeMethod === "UPFRONT" && quote.payable > 0;

  let applicationId: string;
  try {
    // Someone already trading doesn't need to apply again. The email belongs to
    // a retail User and the agent record is in the bundle database, so the
    // lookup goes through the id rather than through a relation.
    const userId = existingUser?.id ?? (await userIdForEmail(email));
    const alreadyAnAgent = userId
      ? await dataDb.dataAgent.findUnique({ where: { userId }, select: { id: true } })
      : null;
    if (alreadyAnAgent) {
      return { error: "That email already has an agent account. Sign in instead." };
    }

    // An email that already signs in to Nickimart cannot be claimed from a
    // public form by typing a new password for it. Sign in first; the form
    // then adds a storefront to that account and never asks for one.
    if (!existingUser && userId) {
      const account = await prisma.user
        .findUnique({ where: { id: userId }, select: { passwordHash: true } })
        .catch(() => null);
      if (account?.passwordHash) {
        return {
          error: "That email already has a Nickimart account. Sign in first, then apply.",
        };
      }
    }

    const openApplication = await dataDb.dataAgentApplication.findFirst({
      where: { email, status: "pending" },
      select: { id: true, paymentStatus: true, feeAmount: true, fullName: true },
    });

    if (openApplication) {
      // Applied before and never got through the payment — the commonest way a
      // signup ends half-finished, because the gateway is a page they can close.
      // Send them back to it rather than refusing them as a duplicate.
      if (openApplication.paymentStatus === "pending" && openApplication.feeAmount > 0) {
        const retry = await startApplicationFeePayment({
          id: openApplication.id,
          email,
          fullName: openApplication.fullName,
          feeAmount: openApplication.feeAmount,
        });
        if (retry.ok && retry.authorizationUrl) redirect(retry.authorizationUrl);
        if (retry.ok) {
          return { ok: true, message: "Payment received. We'll review your application shortly." };
        }
        return { error: retry.error };
      }
      return {
        ok: true,
        message:
          "You already have an application waiting — we'll be in touch on the number you gave.",
      };
    }

    const application = await dataDb.dataAgentApplication.create({
      data: {
        firstName: data.firstName,
        lastName: data.lastName,
        fullName,
        phone,
        email,
        storeName: data.storeName,
        desiredSlug,
        note: "",
        referralCode,
        referrerId,
        feeMethod,
        feeAmount: quote.payable,
        feeGross: quote.gross,
        feeWaiverPercent: quote.waiverPercent,
        feeWaived: quote.waived,
        feeReferrerShare: quote.referrerShare,
        // Nothing to collect is a settled state, not a pending one: an
        // application clearing its fee from commission must never look like one
        // waiting on a payment that will never come.
        paymentStatus: payNow ? "pending" : "none",
        // Hashed here and moved onto the account at approval, where it is also
        // cleared. Only set when the applicant isn't already signed in.
        passwordHash: existingUser ? null : await bcrypt.hash(password, 10),
        termsAcceptedAt: new Date(),
      },
      select: { id: true },
    });
    applicationId = application.id;
  } catch (err) {
    // A redirect is thrown, not returned — don't swallow the retry path above.
    if (isRedirectError(err)) throw err;
    return { error: STORAGE_ERROR };
  }

  // Straight to Paystack. This is the whole point of collecting up front: the
  // applicant pays on the form they just filled in, not after somebody decides
  // to approve them.
  if (payNow) {
    const payment = await startApplicationFeePayment({
      id: applicationId,
      email,
      fullName,
      feeAmount: quote.payable,
    });
    if (!payment.ok) return { error: payment.error };
    // Thrown outside the try above so it isn't caught and turned into an error.
    if (payment.authorizationUrl) redirect(payment.authorizationUrl);
    // No gateway configured: the fee was settled directly, so fall through to
    // the confirmation as if it had been paid — which it has.
  }

  // No revalidatePath here. The admin queue is force-dynamic, so there is
  // nothing cached to invalidate — but revalidating during an action refreshes
  // the route the applicant is standing on, which remounts this form and throws
  // away the confirmation it is about to return.

  await notifyAdminsOfApplication(fullName, desiredSlug);

  return {
    ok: true,
    message: payNow
      ? "Payment received. We'll review your application and text you — usually the same day."
      : "Application received. We'll review it and text you on the number you gave — usually the same day.",
  };
}

/** Tell the admins there's something in the queue. Best-effort, always. */
async function notifyAdminsOfApplication(fullName: string, slug: string): Promise<void> {
  try {
    const admins = await prisma.user.findMany({
      where: { role: "ADMIN" },
      select: { phone: true, email: true },
    });
    await Promise.allSettled(
      admins.map((a) =>
        notify(a, {
          sms: `Nickimart: ${fullName} has applied to become a data agent (store “${slug}”). Review it in Admin → Data → Agents.`,
          emailSubject: "New data agent application",
        }),
      ),
    );
  } catch {
    // The application is already saved; telling the admins is not worth failing for.
  }
}

/**
 * Next throws a redirect rather than returning one, so a `catch` around a
 * database call will happily swallow a navigation and report a storage error
 * that never happened.
 */
function isRedirectError(err: unknown): boolean {
  return (
    typeof err === "object" &&
    err !== null &&
    typeof (err as { digest?: unknown }).digest === "string" &&
    (err as { digest: string }).digest.startsWith("NEXT_REDIRECT")
  );
}

// ---------------------------------------------------------------------------
// Reviewing
// ---------------------------------------------------------------------------

/**
 * Approve an application: create the account, open the store, settle the
 * registration fee, and tell them they're in.
 *
 * Approval is the activation. Before it there is a row in a queue; after it
 * there is an account that can sign in, a storefront that is open for business
 * and a console that can buy. So it is deliberately not offered for an
 * application whose registration payment has not cleared — an approved agent
 * who still owes an up-front fee is exactly the thing collecting up front
 * exists to prevent.
 */
export async function approveApplication(
  _prev: ApplyState,
  fd: FormData,
): Promise<ApplyState> {
  const admin = await requireAdmin();
  const id = String(fd.get("id") ?? "").trim();
  if (!id) return { error: "Missing application." };

  const config = await getAgentProgramConfig();

  let application;
  try {
    application = await dataDb.dataAgentApplication.findUnique({ where: { id } });
  } catch {
    return { error: STORAGE_ERROR };
  }
  if (!application) return { error: "That application no longer exists." };
  if (application.status !== "pending") {
    return { error: `This application was already ${application.status}.` };
  }

  // The gate. Nothing else in this function needs to know about money: either
  // the fee was paid on the signup form, or there was never one to pay.
  if (application.paymentStatus === "pending") {
    return {
      error:
        `${application.fullName} hasn't completed the ` +
        `${formatMoney(application.feeAmount)} registration payment yet. ` +
        "They can finish it by submitting the signup form again with the same email.",
    };
  }

  // The name may have been taken while the application waited.
  const clash = await dataDb.dataAgent.findUnique({
    where: { slug: application.desiredSlug },
    select: { id: true },
  });
  if (clash) {
    return {
      error: `“${application.desiredSlug}” has been taken since this was submitted. Reject it and ask them for another name.`,
    };
  }

  const email = application.email.toLowerCase();
  const code = await generateAgentCode(application.fullName);
  const feePaid = application.paymentStatus === "paid";
  // Applications made before the password moved onto the signup form carry no
  // hash. Approving one still creates the account, but nobody can sign in to it
  // until an admin issues a setup link — so the admin is told, here, rather
  // than finding out from the agent a week later.
  let needsSetupLink = false;

  // Filled in once the fee is worked out, and quoted back in the welcome
  // email — an agent who is told "nothing to pay" and then finds a payment
  // waiting for them has been told the wrong thing by us, not by the form.
  let feeLine = "";

  try {
    // The person and the agent are in different databases, so this is two
    // steps rather than one transaction. Order matters: the user comes first,
    // because an agent row without a user is an account nobody can sign in to,
    // while a user without an agent row is just a Nickimart customer — which is
    // exactly what they were a moment ago. Nothing is lost if the second half
    // fails; approving again picks up the same user.
    //
    // The password is whatever they chose on the signup form. An account that
    // already existed and already had one keeps it: nothing on a public form
    // proves the applicant owns that email, so approving an application can
    // never rewrite a password somebody else signs in with.
    const existing = await prisma.user.findUnique({ where: { email } });
    const user =
      existing ??
      (await prisma.user.create({
        data: {
          email,
          name: application.fullName,
          phone: application.phone,
          role: "CUSTOMER",
          passwordHash: application.passwordHash,
          termsAcceptedAt: application.termsAcceptedAt ?? new Date(),
        },
      }));

    if (existing && !existing.passwordHash && application.passwordHash) {
      await prisma.user.update({
        where: { id: existing.id },
        data: {
          passwordHash: application.passwordHash,
          name: existing.name ?? application.fullName,
          phone: existing.phone ?? application.phone,
        },
      });
    }

    needsSetupLink = !application.passwordHash && !existing?.passwordHash;

    // Who recruited them, re-resolved now rather than trusted from the
    // application: the code was checked when it was typed, and the agent it
    // names may have been suspended in the days since. A code that no longer
    // works is not a reason to refuse the application — the applicant did
    // nothing wrong — so it is dropped and the approval goes ahead.
    const referralConfig = await getReferralConfig();
    let referrerId: string | null = null;
    if (referralConfig.enabled && application.referralCode) {
      const resolved = await resolveReferralCode(application.referralCode);
      if (resolved.ok) {
        const allowed = await checkReferralLink({
          referrerId: resolved.agentId,
          recruitUserId: user.id,
          recruitEmail: email,
          recruitPhone: application.phone,
        });
        if (allowed.ok) referrerId = allowed.referrerId;
      }
    }

    // What this registration actually cost.
    //
    // A fee already paid is read back off the application — that is the quote
    // they were shown and the money they sent, and the programme's fee may have
    // moved in the days since. One that will clear from commission is quoted
    // fresh, because nothing has been charged yet.
    const quote = feePaid
      ? {
          gross: application.feeGross || application.feeAmount,
          payable: application.feeAmount,
          waiverPercent: application.feeWaiverPercent,
          waived: application.feeWaived,
          referrerShare: application.feeReferrerShare,
          free: application.feeAmount <= 0,
        }
      : await quoteRegistrationFee(referrerId);

    // Nothing left to pay is a waiver, however it came about — a fee of zero,
    // or a referral that waived all of it. Whether that still pays a joining
    // reward is the admin's call (referralFullWaiverPaysReward); the account
    // is settled either way, because there is nothing outstanding on it.
    const feeMethod = quote.free
      ? "WAIVED"
      : feePaid
        ? "UPFRONT"
        : settleMethodFor(config.paymentMode, application.feeMethod, quote.payable);

    const agentId = await dataDb.$transaction(async (tx) => {
      const already = await tx.dataAgent.findUnique({ where: { userId: user.id } });
      if (already) throw new Error("ALREADY_AGENT");

      const agent = await tx.dataAgent.create({
        data: {
          userId: user.id,
          code,
          slug: application.desiredSlug,
          storeName: storeNameFor(application),
          supportPhone: application.phone,
          supportWhatsapp: application.phone,
          whatsappGroup: config.whatsappGroup,
          setupFee: quote.payable,
          balance: 0,
          setupFeeMethod: feeMethod,
          // The breakdown, kept on the row: what it would have cost, what the
          // waiver took off, and what the recruiter is owed out of what is
          // paid. A settings change tomorrow never rewrites this registration.
          setupFeeGross: quote.gross,
          setupFeeWaiverPercent: quote.waiverPercent,
          setupFeeWaived: quote.waived,
          setupFeeReferrerShare: quote.referrerShare,
          // A registration with nothing to pay is settled the moment it is
          // approved. A paid one is settled below, through the ledger, so the
          // wallet carries both halves of it.
          setupFeePaidAt: quote.free ? new Date() : null,
          setupFeeReference: application.feeReference,
          // The relationship is recorded with the account and locked at the
          // same moment. There is no window in which it exists without a
          // referrer and could be given a different one.
          referredById: referrerId,
          referralLockedAt: referrerId ? new Date() : null,
        },
      });

      await tx.dataAgentApplication.update({
        where: { id },
        data: {
          status: "approved",
          reviewedBy: admin.name ?? admin.email ?? admin.id,
          reviewedAt: new Date(),
          agentId: agent.id,
          // The hash has done its job — it lives on the account now, and a
          // copy of it in a reviewed application is a copy nobody needs.
          passwordHash: null,
        },
      });

      return agent.id;
    });

    // The setup fee is charged outside the transaction so a notification
    // failure can't roll the store back.
    //
    // It is charged either way, and always as a debit. On BALANCE it simply
    // clears out of commission, as it always has. On a fee already paid at
    // signup the matching credit is posted immediately below, so the wallet
    // shows what was charged and what was paid in one reconcilable pair rather
    // than a flag nobody can audit.
    if (quote.payable > 0) {
      await postLedgerEntry({
        agentId,
        type: "SETUP_FEE",
        amount: -quote.payable,
        narration:
          `Registration fee${quote.waived > 0 ? ` (${quote.waiverPercent}% referral waiver)` : ""} — ` +
          (feePaid ? "paid at signup" : "clears automatically from your commissions"),
        reference: code,
      });
    }

    // Paid on the signup form: credit it, stamp it settled, and release
    // whatever it owes the recruiter — the same path an agent paying from
    // their own dashboard takes.
    if (feePaid && quote.payable > 0) {
      await settleRegistrationFee(agentId, application.feeReference ?? code);
    } else if (referrerId) {
      // Nothing to release in the ordinary case: the fee has just been charged,
      // not paid. It matters for the one case where the programme still owes
      // something immediately — an admin who set the fee to zero after the
      // application was made, leaving a balance already at zero.
      await releaseReferralRewards(agentId);
    }

    feeLine = feePaid
      ? `<p>Your registration fee of <strong>${formatMoney(quote.payable)}</strong> is paid and settled.</p>`
      : quote.free
        ? `<p>Your registration fee has been waived in full${quote.waived > 0 ? " by the agent who recruited you" : ""} — there is nothing to pay.</p>`
        : `<p>Opening the store cost ${formatMoney(quote.payable)}` +
          `${quote.waived > 0 ? ` (${quote.waiverPercent}% off, thanks to the agent who recruited you)` : ""}, ` +
          `charged to your balance rather than to you. It clears itself out of the commission you earn, ` +
          `so there is nothing to pay up front.</p>`;
  } catch (err) {
    if (err instanceof Error && err.message === "ALREADY_AGENT") {
      return { error: "That person already has an agent account." };
    }
    return { error: "Couldn't approve that application. Please try again." };
  }

  // What they get told, and all they need to be told: they're approved, and
  // they sign in with the password they already chose. No link to deliver, and
  // therefore no approval that quietly ends in an account nobody can open.
  const signIn = `${siteUrl()}/login`;
  // The one case where they can't just sign in — an application from before
  // passwords were collected — must not be told that they can.
  const howToGetIn = needsSetupLink
    ? "We'll send your sign-in details shortly."
    : `Sign in at ${signIn} with the password you chose.`;

  const sent = await Promise.allSettled([
    sendSms(
      application.phone,
      `Nickimart: your agent application is approved. Your store ${siteUrl()}/store/${application.desiredSlug} ` +
        `is live and your agent code is ${code}. ${howToGetIn}`,
    ),
    notify(
      { email: application.email, phone: null },
      {
        sms: `Your Nickimart agent account is approved. ${howToGetIn}`,
        emailSubject: "Your Nickimart agent account is approved",
        emailHtml:
          `<p>Welcome aboard — your application has been approved and your store is live.</p>` +
          `<p>Your store link is <strong>${siteUrl()}/store/${application.desiredSlug}</strong><br>` +
          `Your agent code is <strong>${code}</strong>.</p>` +
          (needsSetupLink
            ? `<p>We'll send your sign-in details shortly.</p>`
            : `<p><a href="${signIn}">Sign in</a> with the email and password you registered with.</p>`) +
          feeLine,
      },
    ),
  ]);

  const delivered = sent.some(
    (r) =>
      r.status === "fulfilled" &&
      (r.value === true || (typeof r.value === "object" && r.value !== null && (r.value.sms || r.value.email))),
  );

  // No revalidatePath. Refreshing this route remounts the review panel and
  // throws away the state it is about to return. The queue catches up on the
  // admin's next navigation; a second approve is refused by the status guard
  // above, so a stale row is harmless.
  return {
    ok: true,
    delivered: delivered && !needsSetupLink,
    message: needsSetupLink
      ? `Approved — but ${application.fullName} applied before passwords were collected at signup and has none. Send them a setup link from their agent page.`
      : delivered
        ? `Approved. ${application.fullName} can sign in now and has been told so.`
        : `Approved — ${application.fullName} can sign in now, but the text and email couldn't be sent. Let them know.`,
  };
}

export async function rejectApplication(
  _prev: ApplyState,
  fd: FormData,
): Promise<ApplyState> {
  const admin = await requireAdmin();
  const id = String(fd.get("id") ?? "").trim();
  const reason = String(fd.get("adminNote") ?? "").trim();
  if (!id) return { error: "Missing application." };

  try {
    const updated = await dataDb.dataAgentApplication.updateMany({
      where: { id, status: "pending" },
      data: {
        status: "rejected",
        reviewedBy: admin.name ?? admin.email ?? admin.id,
        reviewedAt: new Date(),
        adminNote: reason,
      },
    });
    if (updated.count === 0) return { error: "That application was already reviewed." };

    const application = await dataDb.dataAgentApplication.findUnique({
      where: { id },
      select: { phone: true, fullName: true, paymentStatus: true, feeAmount: true, feeReference: true },
    });
    if (application) {
      await sendSms(
        application.phone,
        `Nickimart: thanks for applying to become a data agent. We can't approve it at this time${reason ? ` — ${reason}` : ""}.`,
      ).catch(() => {});

      // Somebody who paid and was turned down is owed their money back. There
      // is no account to credit it to, so it has to be a refund somebody makes
      // — and the only way that happens is if the person rejecting them is told
      // so, here, with the reference in their hand.
      if (application.paymentStatus === "paid" && application.feeAmount > 0) {
        return {
          ok: true,
          message:
            `Application rejected. ${application.fullName} paid ` +
            `${formatMoney(application.feeAmount)} (ref ${application.feeReference ?? "—"}) — refund it in Paystack.`,
        };
      }
    }
  } catch {
    return { error: STORAGE_ERROR };
  }

  // Same reason as approval: a refresh here remounts the review panel and
  // swallows the confirmation. The status guard makes a stale row harmless.
  return { ok: true, message: "Application rejected." };
}

// ---------------------------------------------------------------------------
// Setting up the account
// ---------------------------------------------------------------------------

export type SetupState = { ok?: boolean; error?: string; message?: string };

/**
 * Redeem a setup link: choose a password, name the store, and go live.
 *
 * Registration no longer issues one of these — an applicant chooses their
 * password on the signup form, so approval has nothing to deliver. What remains
 * is the recovery route: an admin can issue a link from the agent's own page
 * for an account that somehow has no password, and links issued before this
 * changed keep working until they expire.
 *
 * The token is single-use and looked up by hash, so the link in an inbox is the
 * only copy that works and it stops working the moment it's used.
 */
export async function completeAgentSetup(
  _prev: SetupState,
  fd: FormData,
): Promise<SetupState> {
  const token = String(fd.get("token") ?? "").trim();
  const password = String(fd.get("password") ?? "");
  const confirm = String(fd.get("confirmPassword") ?? "");
  const storeName = String(fd.get("storeName") ?? "").trim();

  if (!token) return { error: "This setup link is missing its token." };
  if (password.length < 6) return { error: "Choose a password of at least 6 characters." };
  if (password !== confirm) return { error: "Both passwords must match." };
  if (storeName.length < 2) return { error: "Give your store a name." };

  const limit = await rateLimit(`agent-setup:${await clientIp()}`, 10, 15 * 60_000);
  if (!limit.ok) {
    return { error: `Too many attempts. Please try again in ${retryAfterLabel(limit.retryAfter)}.` };
  }

  let application;
  try {
    application = await dataDb.dataAgentApplication.findFirst({
      where: { setupTokenHash: hashToken(token), status: "approved" },
    });
  } catch {
    return { error: STORAGE_ERROR };
  }

  if (!application || !application.agentId) {
    return { error: "That setup link is not valid. Ask support for a new one." };
  }
  if (application.setupExpiresAt && application.setupExpiresAt.getTime() < Date.now()) {
    return { error: "That setup link has expired. Ask support for a new one." };
  }

  const passwordHash = await bcrypt.hash(password, 10);
  let hadPassword = false;

  try {
    const agent = await dataDb.dataAgent.findUniqueOrThrow({
      where: { id: application.agentId! },
      select: { userId: true },
    });

    // An applicant may already have shopped on Nickimart, in which case
    // approval reused their account.
    //
    // Nothing here has proved the applicant owns that email — they typed it
    // on a public form. So an account that already has a password is left
    // exactly as it is: not the password (that would reset the one its owner
    // signs in with), and not the name or phone either (whoever redeemed
    // this link would otherwise be rewriting a stranger's profile). Only an
    // account this approval created — no password, nothing to overwrite —
    // gets filled in from the application.
    //
    // The password is in the retail database and the store name is in the
    // bundle one, so the two writes can't share a transaction. The password
    // goes first: it is the half that matters, and a store that kept its
    // provisional name is a rename away from right, while a named store nobody
    // can sign in to is a support ticket.
    const user = await prisma.user.findUniqueOrThrow({
      where: { id: agent.userId },
      select: { passwordHash: true },
    });
    hadPassword = Boolean(user.passwordHash);
    if (!hadPassword) {
      await prisma.user.update({
        where: { id: agent.userId },
        data: { passwordHash, name: application.fullName, phone: application.phone },
      });
    }

    await dataDb.$transaction(async (tx) => {
      await tx.dataAgent.update({
        where: { id: application.agentId! },
        data: { storeName },
      });
      // Burn the token — the link is single-use.
      await tx.dataAgentApplication.update({
        where: { id: application.id },
        data: { setupTokenHash: null, setupExpiresAt: null },
      });
    });
  } catch {
    return { error: "Couldn't finish setting up your account. Please try again." };
  }

  // Same reason as in applyToBeAgent: refreshing here would remount the setup
  // form and swallow the "you're all set" confirmation. /agent is force-dynamic
  // and the person doing this isn't signed in yet, so there is nothing to
  // invalidate for them anyway.
  return {
    ok: true,
    message: hadPassword
      ? "Your store is live. Sign in with your existing Nickimart password."
      : "Your store is live. Sign in to start selling.",
  };
}

/** The application behind a setup token, for rendering the setup form. */
export async function getSetupApplication(token: string) {
  if (!token) return null;
  try {
    const row = await dataDb.dataAgentApplication.findFirst({
      where: { setupTokenHash: hashToken(token), status: "approved" },
      select: {
        fullName: true,
        email: true,
        storeName: true,
        desiredSlug: true,
        setupExpiresAt: true,
        agentId: true,
      },
    });
    if (!row?.agentId) return null;
    if (row.setupExpiresAt && row.setupExpiresAt.getTime() < Date.now()) return null;
    return row;
  } catch {
    return null;
  }
}
