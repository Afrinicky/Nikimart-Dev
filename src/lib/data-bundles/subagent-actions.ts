"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { dataDb } from "@/lib/data-db";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/session";
import { rateLimit, retryAfterLabel } from "@/lib/rate-limit";
import { notify, sendSms } from "@/lib/notifications";
import { formatMoney } from "@/lib/format";
import { getAgentProgramConfig } from "@/lib/data-bundles/settings";
import { parseGhPhone } from "@/lib/data-bundles/gh-phone";
import {
  checkStoreName,
  issueApplicationSetupLink,
} from "@/lib/data-bundles/agent-application-actions";
import { getAgentForUser } from "@/lib/data-bundles/agents";
import { quoteRegistrationFee, recruitPaymentMode } from "@/lib/data-bundles/referrals";
import { canChoosePaymentMethod, settleMethodFor } from "@/lib/data-bundles/payment-mode";
import { startApplicationFeePayment } from "@/lib/data-bundles/registration-fee";

/**
 * An agent bringing somebody in from their own console.
 *
 * The old version took the details and then handed the recruiter a referral
 * link to text over — which dropped the recruit back on the public
 * registration page to fill in everything a second time. One form, filled in
 * once, by whoever is actually holding the phone.
 *
 * What happens next is the admin's call, not the recruiter's:
 *
 *   • Pay now. One Paystack checkout, opened immediately. The registration is
 *     not paid until it clears, and an unpaid registration cannot be approved.
 *   • Pay from commission. Nothing is collected; the fee is charged to the new
 *     agent on approval and clears itself out of what they earn. It is only
 *     offered where the programme — or an exception the admin has written
 *     against this particular recruiter — allows it.
 *
 * Either way the recruit is texted and emailed a one-time link the moment they
 * are registered, where they choose their own password and then wait. It
 * creates an application, never an account: a store slug is a public address
 * under Nickimart's domain and an admin still decides who gets one.
 */

export type SubAgentState =
  | { ok?: false; error?: string }
  | {
      ok: true;
      /** What the recruit was quoted. */
      payable: number;
      /** Send the recruiter here to pay, when there is a payment to make. */
      payUrl?: string;
      /** Their name, for the confirmation. */
      name: string;
      message: string;
    };

const schema = z.object({
  firstName: z.string().trim().min(2, "Enter their first name.").max(40),
  lastName: z.string().trim().min(2, "Enter their last name.").max(40),
  phone: z.string().trim().min(1, "Enter their phone number."),
  email: z.string().trim().email("Enter a valid email address."),
  storeName: z.string().trim().min(2, "Enter the store name they want.").max(60),
  /** "commission" charges it to the new agent's balance instead of collecting it. */
  payWith: z.enum(["paystack", "commission"]).optional(),
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
  // the referrer — so their waiver applies exactly as it would on their link.
  const quote = await quoteRegistrationFee(agent.id);

  // And settled the way the admin says this agent's recruits settle. A form
  // posting "commission" into an up-front-only programme is corrected here
  // rather than honoured — the browser does not get a vote on what is
  // collected.
  const mode = await recruitPaymentMode(agent.id);
  const chosen = canChoosePaymentMethod(mode, quote.payable) ? data.payWith : undefined;
  const feeMethod = settleMethodFor(
    mode,
    chosen === "commission" ? "BALANCE" : chosen === "paystack" ? "UPFRONT" : undefined,
    quote.payable,
  );
  const payNow = feeMethod === "UPFRONT" && quote.payable > 0;

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
        feeMethod,
        feeAmount: quote.payable,
        feeGross: quote.gross,
        feeWaiverPercent: quote.waiverPercent,
        feeWaived: quote.waived,
        feeReferrerShare: quote.referrerShare,
        paymentStatus: payNow ? "pending" : "none",
        // No password: they set their own on the link below, which is the
        // whole point of sending it.
        passwordHash: null,
      },
      select: { id: true },
    });
    applicationId = application.id;
  } catch {
    return { error: "Couldn't register them. Please try again." };
  }

  // The gateway first, and the recruit's link only once it has answered. A
  // checkout that cannot be opened has to leave nothing behind — including a
  // link to an application about to be deleted, and an email address that
  // would then refuse the second attempt as a duplicate.
  let payUrl: string | undefined;
  if (payNow) {
    const started = await startApplicationFeePayment(
      { id: applicationId, email, fullName: `${data.firstName} ${data.lastName}`, feeAmount: quote.payable },
      // Back into the console, not onto a public page.
      "/agent/team/verify",
    );
    if (!started.ok) {
      await dataDb.dataAgentApplication
        .delete({ where: { id: applicationId } })
        .catch(() => {});
      return { error: started.error };
    }
    payUrl = started.authorizationUrl;
  }

  // Sent now, not on approval: the recruit is standing there, and a link that
  // arrives while they are still in the room is a link that gets used.
  await sendSetupLink({
    applicationId,
    firstName: data.firstName,
    phone: phone.local,
    email,
    storeName: agent.storeName,
  });

  revalidatePath("/agent/team");

  return {
    ok: true,
    payable: quote.payable,
    payUrl,
    name: `${data.firstName} ${data.lastName}`,
    message: payNow
      ? payUrl
        ? `Registered. Pay their ${formatMoney(quote.payable)} registration to finish.`
        : `Registered and their ${formatMoney(quote.payable)} registration is paid. They're in the queue for approval.`
      : quote.payable > 0
        ? `Registered. Their ${formatMoney(quote.payable)} registration clears from the commission they earn — nothing to pay now.`
        : "Registered, with nothing to pay. They're in the queue for approval.",
  };
}

/**
 * Text and email the recruit their one-time link.
 *
 * Neither channel is allowed to fail the registration: the application exists
 * and an admin can reissue the link from the agent's own page. A recruit with
 * no link is a support message; a registration rolled back because an SMS
 * gateway blinked is lost work.
 */
async function sendSetupLink(input: {
  applicationId: string;
  firstName: string;
  phone: string;
  email: string;
  storeName: string;
}): Promise<void> {
  const url = await issueApplicationSetupLink(input.applicationId);
  if (!url) return;

  const line =
    `Nickimart: ${input.storeName} has registered you as a data agent. ` +
    `Set your password here — ${url}`;

  await Promise.allSettled([
    sendSms(input.phone, line),
    notify(
      { email: input.email, phone: null },
      {
        sms: line,
        emailSubject: "Set your Nickimart agent password",
        emailHtml:
          `<p>Hi ${input.firstName},</p>` +
          `<p><strong>${input.storeName}</strong> has registered you as a Nickimart data agent.</p>` +
          `<p>Choose your password here — the link works once and lasts seven days:</p>` +
          `<p><a href="${url}">${url}</a></p>` +
          `<p>We'll review your registration and text you the moment your store is live.</p>`,
      },
    ),
  ]);
}
