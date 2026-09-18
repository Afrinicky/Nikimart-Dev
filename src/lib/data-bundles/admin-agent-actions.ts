"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { dataDb } from "@/lib/data-db";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/session";
import { formatMoney } from "@/lib/format";
import { getAgentProgramConfig } from "@/lib/data-bundles/settings";
import { parseGhPhone } from "@/lib/data-bundles/gh-phone";
import {
  approveApplication,
  checkStoreName,
} from "@/lib/data-bundles/agent-application-actions";
import { reissueSetupLink } from "@/lib/data-bundles/agent-admin-actions";
import { quoteRegistrationFee, resolveReferralCode } from "@/lib/data-bundles/referrals";
import { clampPercent, registrationQuote } from "@/lib/data-bundles/referral-rules";

/**
 * Nickimart putting an agent on the platform itself.
 *
 * The public form is an application and the queue is the gate, which is right
 * for somebody who arrived on their own. It is the wrong shape for the case
 * this covers: an admin sitting with somebody they have already decided to take
 * on — at a launch, a partner, a shop owner they know — who would otherwise be
 * told to go and fill in a form so that the same admin can approve it a minute
 * later.
 *
 * So this does both halves at once: the application is written and approved in
 * the same call, through exactly the same approval the queue uses, so nothing
 * about how an account comes into being depends on which door it came through.
 * The admin sets the discount, names a recruiter if there is one, and gets back
 * a setup link to hand over — because an account created this way has no
 * password, and an account nobody can sign in to is not an account.
 */

export type AdminAgentState =
  | { ok?: false; error?: string }
  | {
      ok: true;
      /** The one-time link the new agent uses to set their password. */
      setupUrl?: string;
      storeName: string;
      message: string;
    };

const schema = z.object({
  firstName: z.string().trim().min(2, "Enter their first name.").max(40),
  lastName: z.string().trim().min(2, "Enter their last name.").max(40),
  phone: z.string().trim().min(1, "Enter their phone number."),
  email: z.string().trim().email("Enter a valid email address."),
  storeName: z.string().trim().min(2, "Enter the store name.").max(60),
  /** Percent off the registration fee. 100 waives it. */
  waiverPercent: z.number().min(0).max(100),
  /** The agent code of whoever recruited them, if anybody did. */
  referralCode: z.string().trim().max(20).optional(),
});

function str(fd: FormData, key: string): string {
  return String(fd.get(key) ?? "").trim();
}

export async function adminRegisterAgent(
  _prev: AdminAgentState,
  fd: FormData,
): Promise<AdminAgentState> {
  await requireAdmin();

  const parsed = schema.safeParse({
    firstName: str(fd, "firstName"),
    lastName: str(fd, "lastName"),
    phone: str(fd, "phone"),
    email: str(fd, "email"),
    storeName: str(fd, "storeName"),
    waiverPercent: Number(str(fd, "waiverPercent") || "100"),
    referralCode: str(fd, "referralCode") || undefined,
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Please check the form." };
  }
  const data = parsed.data;

  const phone = parseGhPhone(data.phone);
  if (!phone.ok) return { error: phone.message };
  const email = data.email.toLowerCase();

  const slug = await checkStoreName(data.storeName);
  if (slug.state === "invalid" || slug.state === "taken") return { error: slug.message };
  if (slug.state !== "free") return { error: "Enter the store name." };

  // Somebody already trading is not somebody to register again.
  const existingUserId = await prisma.user
    .findUnique({ where: { email }, select: { id: true } })
    .then((u) => u?.id ?? null)
    .catch(() => null);
  if (existingUserId) {
    const already = await dataDb.dataAgent
      .findUnique({ where: { userId: existingUserId }, select: { id: true } })
      .catch(() => null);
    if (already) return { error: "That email already has an agent account." };
  }
  const open = await dataDb.dataAgentApplication
    .findFirst({ where: { email, status: "pending" }, select: { id: true } })
    .catch(() => null);
  if (open) {
    return { error: "That email already has an application waiting — approve that one instead." };
  }

  // A recruiter is optional, but a code that doesn't resolve is not: an admin
  // who mistypes it would create an agent whose upline silently earns nothing.
  let referrerId: string | null = null;
  const referralCode = (data.referralCode ?? "").toUpperCase();
  if (referralCode) {
    const resolved = await resolveReferralCode(referralCode);
    if (!resolved.ok) return { error: resolved.message };
    referrerId = resolved.agentId;
  }

  // Priced like any other registration, then discounted by whatever the admin
  // chose. Where a recruiter's own waiver is the more generous of the two, it
  // wins — the same "larger discount applies" rule the signup form follows.
  const config = await getAgentProgramConfig();
  const referred = referrerId ? await quoteRegistrationFee(referrerId) : null;
  const quote = registrationQuote({
    fee: config.setupFee,
    waiverPercent: referred?.waiverPercent ?? 0,
    referrerSharePercent: 0,
    hasReferrer: Boolean(referrerId),
    inviteWaiverPercent: clampPercent(data.waiverPercent),
  });

  let applicationId: string;
  try {
    const application = await dataDb.dataAgentApplication.create({
      data: {
        firstName: data.firstName,
        lastName: data.lastName,
        fullName: `${data.firstName} ${data.lastName}`,
        phone: phone.local,
        email,
        storeName: data.storeName,
        desiredSlug: slug.slug,
        note: "Registered from the admin console",
        referralCode,
        referrerId,
        // Nothing is collected here: an admin taking somebody on does not stand
        // over them at a card form. Whatever is left to pay clears from their
        // commission, exactly as the BALANCE route always has.
        feeMethod: "BALANCE",
        feeAmount: quote.payable,
        feeGross: quote.gross,
        feeWaiverPercent: quote.waiverPercent,
        feeWaived: quote.waived,
        feeReferrerShare: quote.referrerShare,
        paymentStatus: "none",
        passwordHash: null,
      },
      select: { id: true },
    });
    applicationId = application.id;
  } catch {
    return { error: "Couldn't create that agent. Please try again." };
  }

  // The same approval the queue runs, so an account created here is identical
  // to one created there — same ledger entries, same referral locking, same
  // welcome message.
  const approval = new FormData();
  approval.set("id", applicationId);
  const approved = await approveApplication({}, approval);
  if (!approved.ok) {
    // Leave nothing half-made behind: the row would sit in the queue looking
    // like an application somebody submitted.
    await dataDb.dataAgentApplication.delete({ where: { id: applicationId } }).catch(() => {});
    return { error: approved.error ?? "Couldn't approve that registration." };
  }

  // Approved accounts made this way have no password, so the link is the whole
  // point rather than a fallback.
  const agentId = await dataDb.dataAgentApplication
    .findUnique({ where: { id: applicationId }, select: { agentId: true } })
    .then((a) => a?.agentId ?? null)
    .catch(() => null);

  let setupUrl: string | undefined;
  if (agentId) {
    const link = new FormData();
    link.set("agentId", agentId);
    const issued = await reissueSetupLink(link);
    if (issued.ok) setupUrl = issued.setupUrl;
  }

  revalidatePath("/admin/data/agents");

  return {
    ok: true,
    setupUrl,
    storeName: data.storeName,
    message:
      quote.payable > 0
        ? `${data.storeName} is live. Their ${formatMoney(quote.payable)} registration fee clears from commission.`
        : `${data.storeName} is live, with no registration fee to pay.`,
  };
}
