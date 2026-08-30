"use server";

import { requireAdmin } from "@/lib/session";
import { deliverEmail, emailShell, emailStatus } from "@/lib/notifications";
import { rateLimit } from "@/lib/rate-limit";

export type TestEmailState = { ok?: boolean; message?: string; error?: string };

/**
 * Send one real email, on demand, and report what the provider said.
 *
 * Every other email in the app is fire-and-forget: a failure is swallowed so a
 * delivery hiccup can never break checkout, and the only trace is a line in the
 * server log that nobody is watching. That is the right behaviour for a
 * receipt and the wrong behaviour for switching email on, where the whole
 * question is whether it works — so this path is the one place that surfaces
 * Resend's own refusal verbatim.
 *
 * Admin-only, and rate limited: it sends to an address the caller types, which
 * is exactly the shape of thing that gets used to send mail to somebody else.
 */
export async function sendTestEmail(fd: FormData): Promise<TestEmailState> {
  const admin = await requireAdmin();

  const status = emailStatus();
  if (!status.configured) return { error: status.detail };

  const to = String(fd.get("to") ?? "").trim() || admin.email || "";
  if (!to) {
    return { error: "No address to send to — type one, or add an email to your own account." };
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)) {
    return { error: `"${to}" isn't a valid email address.` };
  }

  const limit = await rateLimit(`test-email:${admin.id}`, 5, 10 * 60 * 1000);
  if (!limit.ok) {
    return { error: "Too many test emails. Wait a few minutes and try again." };
  }

  const sentAt = new Date().toLocaleString("en-GB", { timeZone: "Africa/Accra" });
  const result = await deliverEmail(
    to,
    "Nickimart email test",
    emailShell(
      `If you are reading this, Nickimart can send email to real inboxes.<br/><br/>` +
        `Sent from <strong>${status.from}</strong> at ${sentAt} (Accra).`,
      "Email is working",
    ),
  );

  if (result.ok) {
    return {
      ok: true,
      message: status.deliverable
        ? `Sent to ${to}. If it hasn't arrived in a minute, check the spam folder.`
        : `Resend accepted it, which means ${to} is your own Resend account address. ` +
          `Customers still get nothing until you send from your own domain.`,
    };
  }

  return { error: `Resend refused it (HTTP ${result.status || "no response"}): ${result.detail}` };
}
