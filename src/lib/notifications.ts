import "server-only";
import { normalizeGhPhone } from "@/lib/phone";

/**
 * Notification transport: SMS via Arkesel (Ghana) and optional email.
 *
 * All senders are best-effort and never throw — callers fire-and-forget so a
 * delivery hiccup never breaks checkout, payment, or tracking. Channels are
 * enabled by env keys; when unconfigured they no-op silently.
 *
 * Secrets (ARKESEL_API_KEY, email provider key) are server-only env vars and
 * must never reach the browser.
 */

const ARKESEL_SMS_URL = "https://sms.arkesel.com/api/v2/sms/send";

function arkeselKey(): string | undefined {
  const k = process.env.ARKESEL_API_KEY;
  return k && k.trim() ? k.trim() : undefined;
}
function arkeselSender(): string {
  return (process.env.ARKESEL_SENDER_ID || "NikiMart").trim().slice(0, 11);
}
export function isSmsConfigured(): boolean {
  return Boolean(arkeselKey());
}

function resendKey(): string | undefined {
  const k = process.env.RESEND_API_KEY;
  return k && k.trim() ? k.trim() : undefined;
}
function resendFrom(): string {
  return (process.env.RESEND_FROM || "NikiMart <onboarding@resend.dev>").trim();
}
export function isEmailConfigured(): boolean {
  return Boolean(resendKey());
}

/** Send an SMS via Arkesel. Returns true on success. Never throws. */
export async function sendSms(phone: string | null | undefined, message: string): Promise<boolean> {
  const key = arkeselKey();
  const to = normalizeGhPhone(phone);
  if (!key || !to || !message) return false;
  try {
    const res = await fetch(ARKESEL_SMS_URL, {
      method: "POST",
      headers: { "api-key": key, "Content-Type": "application/json" },
      body: JSON.stringify({ sender: arkeselSender(), message, recipients: [to] }),
      cache: "no-store",
    });
    return res.ok;
  } catch {
    return false;
  }
}

/** Send an email via Resend if configured. Returns true on success. Never throws. */
export async function sendEmail(to: string | null | undefined, subject: string, html: string): Promise<boolean> {
  const key = resendKey();
  if (!key || !to) return false;
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from: resendFrom(), to: [to], subject, html }),
      cache: "no-store",
    });
    return res.ok;
  } catch {
    return false;
  }
}

export interface Recipient {
  name?: string | null;
  phone?: string | null;
  email?: string | null;
}

/**
 * Notify a recipient across all configured channels. `sms` is the plain-text
 * message; `emailSubject`/`emailHtml` default to the SMS text when omitted.
 * Fire-and-forget: awaiting is optional and failures are swallowed.
 */
export type NotifyChannel = "sms" | "email" | "both";

export async function notify(
  to: Recipient,
  opts: { sms: string; emailSubject?: string; emailHtml?: string },
  channel: NotifyChannel = "both",
): Promise<void> {
  const tasks: Promise<unknown>[] = [];
  if (to.phone && channel !== "email") tasks.push(sendSms(to.phone, opts.sms));
  if (to.email && channel !== "sms") {
    tasks.push(sendEmail(to.email, opts.emailSubject ?? "NikiMart", opts.emailHtml ?? emailShell(opts.sms)));
  }
  await Promise.allSettled(tasks);
}

/** Minimal branded email wrapper around a plain message. */
export function emailShell(body: string, heading = "NikiMart"): string {
  return `<div style="font-family:Arial,Helvetica,sans-serif;max-width:520px;margin:0 auto;padding:24px">
    <div style="font-size:20px;font-weight:700;color:#0e1f36">Niki<span style="color:#ff7a1a">Mart</span></div>
    <h1 style="font-size:18px;color:#111827;margin:16px 0 8px">${heading}</h1>
    <p style="font-size:14px;color:#374151;line-height:1.6">${body}</p>
    <hr style="border:none;border-top:1px solid #eee;margin:24px 0" />
    <p style="font-size:12px;color:#9ca3af">NikiMart — Shop smart. Sell faster. Deliver closer.</p>
  </div>`;
}
