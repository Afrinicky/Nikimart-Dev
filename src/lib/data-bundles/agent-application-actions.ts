"use server";

import { createHash, randomBytes } from "crypto";
import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/session";
import { rateLimit, retryAfterLabel } from "@/lib/rate-limit";
import { notify, sendSms } from "@/lib/notifications";
import { siteUrl } from "@/lib/site";
import { formatMoney } from "@/lib/format";
import { getAgentProgramConfig } from "@/lib/settings";
import { parseGhPhone } from "@/lib/data-bundles/gh-phone";
import { termsAccepted, TERMS_REQUIRED_MESSAGE } from "@/lib/terms";
import { normaliseSlugClient } from "@/lib/data-bundles/slug";
import { postLedgerEntry } from "@/lib/data-bundles/agent-ledger";
import { generateAgentCode, slugProblem } from "@/lib/data-bundles/agents";

/**
 * Becoming an agent, from application to a working account.
 *
 * The shape is deliberate: an applicant gives their name, contact, email and
 * the store name they want, and nothing exists until an admin approves it. A
 * store slug is a public URL and the agent's identity to their own customers,
 * so it gets a human look before it is minted, and NikiMart chooses who resells
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
};

const STORAGE_ERROR =
  "Couldn't submit — the agent tables aren't set up on this database yet. " +
  "Run the Neon catch-up SQL (nikimart-neon-agent-applications.sql), then try again.";

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
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
      prisma.dataAgent.findUnique({ where: { slug }, select: { id: true } }),
      prisma.dataAgentApplication.findFirst({
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
// Applying
// ---------------------------------------------------------------------------

const applySchema = z.object({
  fullName: z.string().trim().min(3, "Enter your full name."),
  phone: z.string().min(1, "Enter your phone number."),
  email: z.string().trim().email("Enter a valid email address."),
  storeName: z.string().trim().min(2, "Enter the store name you want."),
  note: z.string().trim().max(400).optional(),
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

  try {
    // Someone already trading doesn't need to apply again.
    const existingAgent = await prisma.dataAgent.findFirst({
      where: { user: { email } },
      select: { id: true },
    });
    if (existingAgent) {
      return { error: "That email already has an agent account. Sign in instead." };
    }

    const openApplication = await prisma.dataAgentApplication.findFirst({
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

    await prisma.dataAgentApplication.create({
      data: {
        fullName: data.fullName,
        phone,
        email,
        desiredSlug,
        note: data.note ?? "",
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
          sms: `NikiMart: ${data.fullName} has applied to become a data agent (store “${desiredSlug}”). Review it in Admin → Data → Agents.`,
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
    application = await prisma.dataAgentApplication.findUnique({ where: { id } });
  } catch {
    return { error: STORAGE_ERROR };
  }
  if (!application) return { error: "That application no longer exists." };
  if (application.status !== "pending") {
    return { error: `This application was already ${application.status}.` };
  }

  // The name may have been taken while the application waited.
  const clash = await prisma.dataAgent.findUnique({
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

  try {
    const agentId = await prisma.$transaction(async (tx) => {
      // An applicant may already shop on NikiMart — reuse that account rather
      // than stranding them with two.
      const user =
        (await tx.user.findUnique({ where: { email } })) ??
        (await tx.user.create({
          data: { email, name: application.fullName, phone: application.phone, role: "CUSTOMER" },
        }));

      const already = await tx.dataAgent.findUnique({ where: { userId: user.id } });
      if (already) throw new Error("ALREADY_AGENT");

      const agent = await tx.dataAgent.create({
        data: {
          userId: user.id,
          code,
          slug: application.desiredSlug,
          storeName: application.fullName.split(" ")[0]
            ? `${application.fullName.split(" ")[0]}'s Data`
            : application.desiredSlug,
          supportPhone: application.phone,
          supportWhatsapp: application.phone,
          whatsappGroup: config.whatsappGroup,
          setupFee: config.setupFee,
          balance: 0,
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
    if (config.setupFee > 0) {
      await postLedgerEntry({
        agentId,
        type: "SETUP_FEE",
        amount: -config.setupFee,
        narration: "Storefront setup fee — clears automatically from your commissions",
        reference: code,
      });
    }
  } catch (err) {
    if (err instanceof Error && err.message === "ALREADY_AGENT") {
      return { error: "That person already has an agent account." };
    }
    return { error: "Couldn't approve that application. Please try again." };
  }

  const setupUrl = `${siteUrl()}/agent-setup?token=${token}`;
  await Promise.allSettled([
    sendSms(
      application.phone,
      `NikiMart: your agent application is approved. Set your password and open your store: ${setupUrl}`,
    ),
    notify(
      { email: application.email, phone: null },
      {
        sms: `Your NikiMart agent account is approved. Set your password: ${setupUrl}`,
        emailSubject: "Your NikiMart agent account is approved",
        emailHtml:
          `<p>Welcome aboard.</p>` +
          `<p>Your store link is <strong>${siteUrl()}/store/${application.desiredSlug}</strong><br>` +
          `Your agent code is <strong>${code}</strong>.</p>` +
          `<p><a href="${setupUrl}">Set your password and open your store</a> — the link is valid for 7 days.</p>` +
          `<p>Opening the store cost ${formatMoney(config.setupFee)}, charged to your balance rather than to you. ` +
          `It clears itself out of the commission you earn, so there is nothing to pay up front.</p>`,
      },
    ),
  ]);

  revalidatePath("/admin/data/agents");
  return { ok: true, message: `Approved. ${application.fullName} has been sent a setup link.` };
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
    const updated = await prisma.dataAgentApplication.updateMany({
      where: { id, status: "pending" },
      data: {
        status: "rejected",
        reviewedBy: admin.name ?? admin.email ?? admin.id,
        reviewedAt: new Date(),
        adminNote: reason,
      },
    });
    if (updated.count === 0) return { error: "That application was already reviewed." };

    const application = await prisma.dataAgentApplication.findUnique({
      where: { id },
      select: { phone: true, fullName: true },
    });
    if (application) {
      await sendSms(
        application.phone,
        `NikiMart: thanks for applying to become a data agent. We can't approve it at this time${reason ? ` — ${reason}` : ""}.`,
      ).catch(() => {});
    }
  } catch {
    return { error: STORAGE_ERROR };
  }

  revalidatePath("/admin/data/agents");
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
    application = await prisma.dataAgentApplication.findFirst({
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
    await prisma.$transaction(async (tx) => {
      const agent = await tx.dataAgent.findUniqueOrThrow({
        where: { id: application.agentId! },
        select: { userId: true },
      });

      // An applicant may already have shopped on NikiMart, in which case
      // approval reused their account.
      //
      // Nothing here has proved the applicant owns that email — they typed it
      // on a public form. So an account that already has a password is left
      // exactly as it is: not the password (that would reset the one its owner
      // signs in with), and not the name or phone either (whoever redeemed
      // this link would otherwise be rewriting a stranger's profile). Only an
      // account this approval created — no password, nothing to overwrite —
      // gets filled in from the application.
      const user = await tx.user.findUniqueOrThrow({
        where: { id: agent.userId },
        select: { passwordHash: true },
      });
      hadPassword = Boolean(user.passwordHash);
      if (!hadPassword) {
        await tx.user.update({
          where: { id: agent.userId },
          data: { passwordHash, name: application.fullName, phone: application.phone },
        });
      }
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
      ? "Your store is live. Sign in with your existing NikiMart password."
      : "Your store is live. Sign in to start selling.",
  };
}

/** The application behind a setup token, for rendering the setup form. */
export async function getSetupApplication(token: string) {
  if (!token) return null;
  try {
    const row = await prisma.dataAgentApplication.findFirst({
      where: { setupTokenHash: hashToken(token), status: "approved" },
      select: {
        fullName: true,
        email: true,
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
