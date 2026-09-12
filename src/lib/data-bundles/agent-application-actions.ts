"use server";

import { createHash, randomBytes } from "crypto";
import { headers } from "next/headers";
import bcrypt from "bcryptjs";
import { z } from "zod";
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
  checkReferralLink,
  quoteRegistrationFee,
  releaseReferralRewards,
  resolveReferralCode,
} from "@/lib/data-bundles/referrals";

/**
 * Becoming an agent, from application to a working account.
 *
 * The shape is deliberate: an applicant gives their name, contact, email and
 * the store name they want, and nothing exists until an admin approves it. A
 * store slug is a public URL and the agent's identity to their own customers,
 * so it gets a human look before it is minted, and Nickimart chooses who resells
 * under its name.
 *
 * No password is collected on the form. Approval provisions the account and
 * issues a one-time setup link, so nothing worth stealing sits in the
 * applications table while it waits.
 */

export type ApplyState = {
  ok?: boolean;
  error?: string;
  message?: string;
  /** Shown against the acceptance box rather than at the top of the form. */
  termsError?: string;
  /**
   * The one-time setup link, handed back to the admin who approved it.
   *
   * It used to leave only by SMS and email. With no Arkesel or Resend key
   * configured both are skipped silently, the applicant never receives it, and
   * there is no other way to set a password — the account exists and nobody
   * can sign in to it. The admin sees the link now and can send it themselves.
   */
  setupUrl?: string;
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
  fullName: z.string().trim().min(3, "Enter your full name."),
  phone: z.string().min(1, "Enter your phone number."),
  email: z.string().trim().email("Enter a valid email address."),
  storeName: z.string().trim().min(2, "Enter the store name you want."),
  note: z.string().trim().max(400).optional(),
  /** The agent code of whoever recruited them. Optional — most people have none. */
  referralCode: z.string().trim().max(20).optional(),
  /**
   * How they want to settle the registration fee. BALANCE is the original
   * behaviour: it is debited on approval and clears out of their commission, so
   * there is nothing to pay before they start. UPFRONT means they pay it
   * through Paystack once their account exists.
   */
  feeMethod: z.enum(["BALANCE", "UPFRONT"]).optional(),
});

export async function applyToBeAgent(
  _prev: ApplyState,
  fd: FormData,
): Promise<ApplyState> {
  const config = await getAgentProgramConfig();
  if (!config.enabled) {
    return { error: "Agent signup is closed at the moment. Please check back soon." };
  }

  if (!termsAccepted(fd)) return { termsError: TERMS_REQUIRED_MESSAGE };

  const parsed = applySchema.safeParse({
    fullName: fd.get("fullName"),
    phone: fd.get("phone"),
    email: fd.get("email"),
    storeName: fd.get("storeName"),
    note: fd.get("note") ?? undefined,
    referralCode: fd.get("referralCode") ?? undefined,
    feeMethod: fd.get("feeMethod") ?? undefined,
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Please check the form and try again." };
  }
  const data = parsed.data;

  const phoneCheck = parseGhPhone(data.phone);
  if (!phoneCheck.ok) return { error: phoneCheck.message };
  const phone = phoneCheck.local;

  const email = data.email.toLowerCase();

  // Applications are free to submit, so rate-limit them or the queue becomes
  // someone's plaything.
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

  try {
    // Someone already trading doesn't need to apply again. The email belongs to
    // a retail User and the agent record is in the bundle database, so the
    // lookup goes through the id rather than through a relation.
    const existingUserId = await userIdForEmail(email);
    const existingAgent = existingUserId
      ? await dataDb.dataAgent.findUnique({ where: { userId: existingUserId }, select: { id: true } })
      : null;
    if (existingAgent) {
      return { error: "That email already has an agent account. Sign in instead." };
    }

    const openApplication = await dataDb.dataAgentApplication.findFirst({
      where: { email, status: "pending" },
      select: { id: true },
    });
    if (openApplication) {
      return {
        ok: true,
        message:
          "You already have an application waiting — we'll be in touch on the number you gave.",
      };
    }

    await dataDb.dataAgentApplication.create({
      data: {
        fullName: data.fullName,
        phone,
        email,
        storeName: data.storeName,
        desiredSlug,
        note: data.note ?? "",
        referralCode,
        referrerId,
        feeMethod,
        termsAcceptedAt: new Date(),
      },
    });
  } catch {
    return { error: STORAGE_ERROR };
  }

  // No revalidatePath here. The admin queue is force-dynamic, so there is
  // nothing cached to invalidate — but revalidating during an action refreshes
  // the route the applicant is standing on, which remounts this form and throws
  // away the "Application received" state it is about to return. The admin sees
  // the new application on their next load either way.

  // Tell the admins there's something in the queue.
  try {
    const admins = await prisma.user.findMany({
      where: { role: "ADMIN" },
      select: { phone: true, email: true },
    });
    await Promise.allSettled(
      admins.map((a) =>
        notify(a, {
          sms: `Nickimart: ${data.fullName} has applied to become a data agent (store “${desiredSlug}”). Review it in Admin → Data → Agents.`,
          emailSubject: "New data agent application",
        }),
      ),
    );
  } catch {
    // Notifying admins is best-effort; the application is already saved.
  }

  return {
    ok: true,
    message:
      "Application received. We'll review it and text you on the number you gave — usually the same day.",
  };
}

// ---------------------------------------------------------------------------
// Reviewing
// ---------------------------------------------------------------------------

/**
 * Approve an application: create the account, open the store, charge the setup
 * fee as a debit, and send a one-time link for choosing a password.
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
  const token = randomBytes(32).toString("hex");

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
    const user =
      (await prisma.user.findUnique({ where: { email } })) ??
      (await prisma.user.create({
        data: { email, name: application.fullName, phone: application.phone, role: "CUSTOMER" },
      }));

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

    // What this registration actually costs, worked out once and committed
    // here: the fee at full price, whatever their recruiter's waiver takes
    // off it, and the share of the rest that recruiter is owed. Quoted from
    // the same function the signup form quotes, so the applicant is charged
    // what they were shown.
    const quote = await quoteRegistrationFee(referrerId);

    // Nothing left to pay is a waiver, however it came about — a fee of zero,
    // or a referral that waived all of it. Whether that still pays a joining
    // reward is the admin's call (referralFullWaiverPaysReward); the account
    // is settled either way, because there is nothing outstanding on it.
    const feeMethod = quote.free
      ? "WAIVED"
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
          // approved. There is no payment to wait for and no balance to clear.
          setupFeePaidAt: quote.free ? new Date() : null,
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
          setupTokenHash: hashToken(token),
          // Long enough to act on, short enough that a forwarded email stops
          // working.
          setupExpiresAt: new Date(Date.now() + 7 * 24 * 60 * 60_000),
        },
      });

      return agent.id;
    });

    // The setup fee is what puts the account on a negative balance — charged
    // outside the transaction so a notification failure can't roll the store back.
    //
    // It is charged either way. On BALANCE it simply clears out of commission,
    // as it always has. On UPFRONT the debit is what the agent is paying off:
    // their Paystack payment posts a matching credit, which brings them back to
    // zero and settles the fee in one visible pair of ledger lines rather than
    // a flag nobody can audit.
    if (quote.payable > 0) {
      await postLedgerEntry({
        agentId,
        type: "SETUP_FEE",
        amount: -quote.payable,
        narration:
          `Registration fee${quote.waived > 0 ? ` (${quote.waiverPercent}% referral waiver)` : ""} — ` +
          (feeMethod === "UPFRONT"
            ? "payable before your store opens"
            : "clears automatically from your commissions"),
        reference: code,
      });
    }

    // Nothing to release yet in the ordinary case: the fee has just been
    // charged, not paid. It matters for the one case where the programme still
    // owes something immediately — an admin who set the fee to zero after the
    // application was made, leaving a balance already at zero.
    if (referrerId) await releaseReferralRewards(agentId);

    feeLine = quote.free
      ? `<p>Your registration fee has been waived in full${quote.waived > 0 ? " by the agent who recruited you" : ""} — there is nothing to pay.</p>`
      : feeMethod === "UPFRONT"
        ? `<p>Your registration fee is <strong>${formatMoney(quote.payable)}</strong>` +
          `${quote.waived > 0 ? ` (${quote.waiverPercent}% off, thanks to the agent who recruited you)` : ""}. ` +
          `Pay it from your dashboard — your store opens for business as soon as it clears.</p>`
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

  const setupUrl = `${siteUrl()}/agent-setup?token=${token}`;
  const sent = await Promise.allSettled([
    sendSms(
      application.phone,
      `Nickimart: your agent application is approved. Set your password and open your store: ${setupUrl}`,
    ),
    notify(
      { email: application.email, phone: null },
      {
        sms: `Your Nickimart agent account is approved. Set your password: ${setupUrl}`,
        emailSubject: "Your Nickimart agent account is approved",
        emailHtml:
          `<p>Welcome aboard.</p>` +
          `<p>Your store link is <strong>${siteUrl()}/store/${application.desiredSlug}</strong><br>` +
          `Your agent code is <strong>${code}</strong>.</p>` +
          `<p><a href="${setupUrl}">Set your password and open your store</a> — the link is valid for 7 days.</p>` +
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
  // throws away the state it is about to return — and that state now carries
  // the setup link, which is the only copy of it there will ever be. The queue
  // catches up on the admin's next navigation; a second approve is refused by
  // the status guard above, so a stale row is harmless.
  return {
    ok: true,
    setupUrl,
    delivered,
    message: delivered
      ? `Approved. ${application.fullName} has been sent a setup link.`
      : `Approved — but the text and email could not be sent. Give ${application.fullName} the link below yourself.`,
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
      select: { phone: true, fullName: true },
    });
    if (application) {
      await sendSms(
        application.phone,
        `Nickimart: thanks for applying to become a data agent. We can't approve it at this time${reason ? ` — ${reason}` : ""}.`,
      ).catch(() => {});
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
