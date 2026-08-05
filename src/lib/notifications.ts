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

const ARKESEL_V2_URL = "https://sms.arkesel.com/api/v2/sms/send";
const ARKESEL_V1_URL = "https://sms.arkesel.com/sms/api";

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

/** Read a response body for diagnostics without throwing. */
async function safeBody(res: Response): Promise<string> {
  try {
    return (await res.text()).slice(0, 500);
  } catch {
    return "";
  }
}

interface SendAttempt {
  ok: boolean;
  status: number;
  body: string;
}

/** Arkesel V2 — POST /api/v2/sms/send with an `api-key` header. */
async function sendArkeselV2(key: string, to: string, message: string): Promise<SendAttempt> {
  const res = await fetch(ARKESEL_V2_URL, {
    method: "POST",
    headers: { "api-key": key, "Content-Type": "application/json" },
    body: JSON.stringify({ sender: arkeselSender(), message, recipients: [to] }),
    cache: "no-store",
    signal: AbortSignal.timeout(8000),
  });
  const body = await safeBody(res);
  const ok = res.ok && /"status"\s*:\s*"success"/i.test(body);
  return { ok, status: res.status, body };
}

/** Arkesel V1 (legacy) — GET /sms/api?action=send-sms&api_key=… Works with the
 *  key shown on the dashboard's "SMS API" page. Success is `{"code":"ok"}`. */
async function sendArkeselV1(key: string, to: string, message: string): Promise<SendAttempt> {
  const qs = new URLSearchParams({
    action: "send-sms",
    api_key: key,
    to,
    from: arkeselSender(),
    sms: message,
  });
  const res = await fetch(`${ARKESEL_V1_URL}?${qs.toString()}`, {
    method: "GET",
    cache: "no-store",
    signal: AbortSignal.timeout(8000),
  });
  const body = await safeBody(res);
  const ok = res.ok && /"code"\s*:\s*"ok"|"status"\s*:\s*"success"/i.test(body);
  return { ok, status: res.status, body };
}

/**
 * Send an SMS via Arkesel. Returns true on success. Never throws.
 * Tries the V2 endpoint first, then falls back to the V1 (legacy) endpoint so
 * either key type works. The fallback only fires when V2 didn't actually send,
 * so a recipient never gets two messages.
 */
export async function sendSms(phone: string | null | undefined, message: string): Promise<boolean> {
  const key = arkeselKey();
  if (!key) {
    console.warn("[sms] skipped: ARKESEL_API_KEY not set");
    return false;
  }
  const to = normalizeGhPhone(phone);
  if (!to) {
    console.warn(`[sms] skipped: unrecognised Ghana number "${phone}"`);
    return false;
  }
  if (!message) return false;

  const sender = arkeselSender();
  try {
    const v2 = await sendArkeselV2(key, to, message);
    if (v2.ok) return true;
    // 401/invalid-key on V2 usually means a legacy (V1) key — try V1 next.
    const v1 = await sendArkeselV1(key, to, message);
    if (v1.ok) return true;
    console.error(
      `[sms] Arkesel rejected send (sender "${sender}"). ` +
        `v2 HTTP ${v2.status}: ${v2.body} | v1 HTTP ${v1.status}: ${v1.body}`,
    );
    return false;
  } catch (e) {
    console.error(`[sms] Arkesel request failed: ${e instanceof Error ? e.message : String(e)}`);
    return false;
  }
}

/** Send an email via Resend if configured. Returns true on success. Never throws. */
export async function sendEmail(to: string | null | undefined, subject: string, html: string): Promise<boolean> {
  const key = resendKey();
  if (!key) {
    console.warn("[email] skipped: RESEND_API_KEY not set");
    return false;
  }
  if (!to) return false;
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from: resendFrom(), to: [to], subject, html }),
      cache: "no-store",
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) {
      // Common cause: sending from an unverified domain to an address other than
      // your own Resend account — verify a domain to email arbitrary users.
      console.error(`[email] Resend rejected send (HTTP ${res.status}, from "${resendFrom()}", to "${to}"): ${await safeBody(res)}`);
      return false;
    }
    return true;
  } catch (e) {
    console.error(`[email] Resend request failed: ${e instanceof Error ? e.message : String(e)}`);
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

export interface NotifyResult {
  sms?: boolean;
  email?: boolean;
}

export async function notify(
  to: Recipient,
  opts: { sms: string; emailSubject?: string; emailHtml?: string },
  channel: NotifyChannel = "both",
): Promise<NotifyResult> {
  const result: NotifyResult = {};
  const tasks: Promise<unknown>[] = [];
  if (to.phone && channel !== "email") {
    tasks.push(sendSms(to.phone, opts.sms).then((ok) => (result.sms = ok)));
  }
  if (to.email && channel !== "sms") {
    tasks.push(
      sendEmail(to.email, opts.emailSubject ?? "NikiMart", opts.emailHtml ?? emailShell(opts.sms)).then(
        (ok) => (result.email = ok),
      ),
    );
  }
  await Promise.allSettled(tasks);
  return result;
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
