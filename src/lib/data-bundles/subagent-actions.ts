"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { dataDb } from "@/lib/data-db";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/session";
import { rateLimit, retryAfterLabel } from "@/lib/rate-limit";
import { siteUrl } from "@/lib/site";
import { formatMoney } from "@/lib/format";
import { getAgentProgramConfig } from "@/lib/data-bundles/settings";
import { parseGhPhone } from "@/lib/data-bundles/gh-phone";
import { checkStoreName } from "@/lib/data-bundles/agent-application-actions";
import { getAgentForUser, getAgentWallet, withdrawableFrom } from "@/lib/data-bundles/agents";
import { quoteRegistrationFee } from "@/lib/data-bundles/referrals";
import { referralLink } from "@/lib/data-bundles/referral-rules";
import { settleApplicationFee } from "@/lib/data-bundles/registration-fee";
import { InsufficientBalanceError, postLedgerEntry } from "@/lib/data-bundles/agent-ledger";

/**
 * An agent bringing somebody in from their own console.
 *
 * Sharing a referral link works, and most recruits will still arrive that way.
 * But an agent standing next to the person they are recruiting should not have
 * to text them a link and hope: they take the details there and then, and the
 * application lands in the same queue as any other, with the recruiter already
 * attached and their waiver already applied.
 *
 * It creates an application, never an account. A store slug is a public address
 * under Nickimart's domain and an admin still decides who gets one — that gate
 * is the whole reason applications exist, and an agent-facing form must not be
 * a way around it.
 */

export type SubAgentState =
  | { ok?: false; error?: string }
  | {
      ok: true;
      /** What the recruit was quoted. */
      payable: number;
      /** Set when the fee still has to be paid before an admin can approve. */
      awaitingPayment: boolean;
      /** Where to send the recruit to finish. */
      link: string;
      message: string;
    };

const schema = z.object({
  firstName: z.string().trim().min(2, "Enter their first name.").max(40),
  lastName: z.string().trim().min(2, "Enter their last name.").max(40),
  phone: z.string().trim().min(1, "Enter their phone number."),
  email: z.string().trim().email("Enter a valid email address."),
  storeName: z.string().trim().min(2, "Enter the store name they want."),
  /** "wallet" settles the fee from the recruiter's balance. */
  payWith: z.enum(["recruit", "wallet"]).optional(),
});

function str(fd: FormData, key: string): string {
  return String(fd.get(key) ?? "").trim();
}

export async function registerSubAgent(
  _prev: SubAgentState,
  fd: FormData,
): Promise<SubAgentState> {
  const user = await requireUser();
  const agent = await getAgentForUser(user.id);
  if (!agent) return { error: "You don't have an agent account." };
  if (agent.status !== "active") {
    return { error: "Your agent account is suspended. Please contact support." };
  }

  const config = await getAgentProgramConfig();
  if (!config.enabled) {
    return { error: "Agent signup is closed at the moment. Please try again later." };
  }

  const parsed = schema.safeParse({
    firstName: str(fd, "firstName"),
    lastName: str(fd, "lastName"),
    phone: str(fd, "phone"),
    email: str(fd, "email"),
    storeName: str(fd, "storeName"),
    payWith: fd.get("payWith") ?? undefined,
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Please check the form." };
  }
  const data = parsed.data;

  const limit = await rateLimit(`subagent:${agent.id}`, 20, 60 * 60_000);
  if (!limit.ok) {
    return { error: `Too many registrations. Please try again in ${retryAfterLabel(limit.retryAfter)}.` };
  }

  const phone = parseGhPhone(data.phone);
  if (!phone.ok) return { error: phone.message };
  const email = data.email.toLowerCase();

  const slug = await checkStoreName(data.storeName);
  if (slug.state === "invalid" || slug.state === "taken") return { error: slug.message };
  if (slug.state !== "free") return { error: "Enter the store name they want." };

  // Somebody already trading, or already waiting, is not a new recruit.
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
  if (open) return { error: "There is already an application waiting on that email." };

  // Priced through the same function the approval commits, with this agent as
  // the referrer — so their waiver applies exactly as it would on the link.
  const quote = await quoteRegistrationFee(agent.id);
  const payFromWallet = data.payWith === "wallet" && quote.payable > 0;

  if (payFromWallet) {
    const wallet = await getAgentWallet(agent);
    if (withdrawableFrom(wallet) < quote.payable) {
      return {
        error: `Your wallet has ${formatMoney(withdrawableFrom(wallet))} available — the registration costs ${formatMoney(quote.payable)}.`,
      };
    }
  }

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
        note: `Registered by ${agent.storeName} (${agent.code})`,
        referralCode: agent.code,
        referrerId: agent.id,
        feeMethod: quote.payable > 0 ? "UPFRONT" : "BALANCE",
        feeAmount: quote.payable,
        feeGross: quote.gross,
        feeWaiverPercent: quote.waiverPercent,
        feeWaived: quote.waived,
        feeReferrerShare: quote.referrerShare,
        paymentStatus: quote.payable > 0 ? "pending" : "none",
        // No password: the recruit sets their own when they finish signing up.
        passwordHash: null,
      },
      select: { id: true },
    });
    applicationId = application.id;
  } catch {
    return { error: "Couldn't register them. Please try again." };
  }

  const link = referralLink(siteUrl(), agent.code);

  if (payFromWallet) {
    const reference = `WALLET-${applicationId.slice(-10).toUpperCase()}`;
    try {
      await postLedgerEntry({
        agentId: agent.id,
        type: "SUBAGENT_FEE",
        amount: -quote.payable,
        requireBalance: quote.payable,
        narration: `Registration fee for ${data.firstName} ${data.lastName} — paid from your wallet`,
        reference: applicationId,
        dedupeKey: `SUBAGENT_FEE:${applicationId}`,
      });
    } catch (err) {
      // Nothing was charged, so the application must not claim it was paid.
      await dataDb.dataAgentApplication.delete({ where: { id: applicationId } }).catch(() => {});
      return {
        error:
          err instanceof InsufficientBalanceError
            ? "Your balance changed while that was going through. Check your wallet and try again."
            : "Couldn't take that from your wallet. Please try again.",
      };
    }
    await settleApplicationFee(applicationId, reference);
    revalidatePath("/agent/wallet");
  }

  revalidatePath("/agent/team");

  return {
    ok: true,
    payable: quote.payable,
    awaitingPayment: quote.payable > 0 && !payFromWallet,
    link,
    message:
      quote.payable <= 0
        ? "Registered. They're in the queue for approval — we'll email them once their store is live."
        : payFromWallet
          ? `Registered and their ${formatMoney(quote.payable)} fee is paid from your wallet. They're in the queue for approval.`
          : `Registered. They pay ${formatMoney(quote.payable)} to finish — send them your link and they can complete it with the same email.`,
  };
}
