import "server-only";
import { normalizeGhPhone } from "@/lib/phone";
import { describeEmailSender, htmlToText, type EmailSenderStatus } from "@/lib/email-sender";
import { siteUrl } from "@/lib/site";

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
  return (process.env.ARKESEL_SENDER_ID || "Nickimart").trim().slice(0, 11);
}
export function isSmsConfigured(): boolean {
  return Boolean(arkeselKey());
}

function resendKey(): string | undefined {
  const k = process.env.RESEND_API_KEY;
  return k && k.trim() ? k.trim() : undefined;
}
function resendFrom(): string {
  return (process.env.RESEND_FROM || "Nickimart <onboarding@resend.dev>").trim();
}
/** Replies land here rather than at an unwatched from-address. Optional. */
function resendReplyTo(): string | undefined {
  const v = process.env.RESEND_REPLY_TO?.trim();
  return v || undefined;
}
export function isEmailConfigured(): boolean {
  return Boolean(resendKey());
}

/**
 * What email can currently do, for the admin console.
 *
 * Distinct from `isEmailConfigured()`, which only says whether a send will be
 * attempted. A deployment on Resend's sandbox sender is "configured" and still
 * reaches no customer — see lib/email-sender.
 */
export function emailStatus(): EmailSenderStatus {
  return describeEmailSender(resendKey(), resendFrom());
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

/** The outcome of one email send, with enough detail to diagnose a failure. */
export interface EmailSendResult {
  ok: boolean;
  /** HTTP status, or 0 when the request never completed. */
  status: number;
  /** Resend's own message on failure, or a description of what went wrong. */
  detail: string;
}

/**
 * Send one email through Resend and report exactly what happened.
 *
 * Use `sendEmail` for fire-and-forget notifications; this is for the admin
 * test-send, which is worthless unless it can show the provider's own refusal.
 *
 * Retries once on 429. Resend's default rate limit is 2 requests a second, and
 * an order notifies the buyer, the seller and the admins together — enough to
 * trip it and drop a receipt that nothing was wrong with.
 */
export async function deliverEmail(
  to: string | null | undefined,
  subject: string,
  html: string,
): Promise<EmailSendResult> {
  const key = resendKey();
  if (!key) return { ok: false, status: 0, detail: "RESEND_API_KEY is not set." };
  if (!to?.trim()) return { ok: false, status: 0, detail: "No recipient address." };

  const replyTo = resendReplyTo();
  const payload = JSON.stringify({
    from: resendFrom(),
    to: [to.trim()],
    subject,
    html,
    // A text/plain alternative for clients that can't render HTML, and because
    // its absence is a spam signal. See htmlToText in lib/email-sender.
    text: htmlToText(html),
    ...(replyTo ? { reply_to: replyTo } : {}),
  });

  const post = () =>
    fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: payload,
      cache: "no-store",
      signal: AbortSignal.timeout(8000),
    });

  try {
    let res = await post();
    if (res.status === 429) {
      await new Promise((r) => setTimeout(r, 1100));
      res = await post();
    }
    if (res.ok) return { ok: true, status: res.status, detail: "Accepted by Resend." };

    const body = await safeBody(res);
    // By far the most common failure, and the least self-explanatory: the
    // sandbox sender only delivers to the Resend account owner.
    const hint =
      res.status === 403 && !emailStatus().deliverable
        ? ` — ${emailStatus().detail}`
        : "";
    console.error(
      `[email] Resend rejected send (HTTP ${res.status}, from "${resendFrom()}", to "${to}"): ${body}`,
    );
    return { ok: false, status: res.status, detail: `${body || res.statusText}${hint}` };
  } catch (e) {
    const detail = e instanceof Error ? e.message : String(e);
    console.error(`[email] Resend request failed: ${detail}`);
    return { ok: false, status: 0, detail };
  }
}

/** Send an email via Resend if configured. Returns true on success. Never throws. */
export async function sendEmail(to: string | null | undefined, subject: string, html: string): Promise<boolean> {
  if (!resendKey()) {
    console.warn("[email] skipped: RESEND_API_KEY not set");
    return false;
  }
  return (await deliverEmail(to, subject, html)).ok;
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
      sendEmail(to.email, opts.emailSubject ?? "Nickimart", opts.emailHtml ?? emailShell(opts.sms)).then(
        (ok) => (result.email = ok),
      ),
    );
  }
  await Promise.allSettled(tasks);
  return result;
}

/**
 * The branded wrapper every email goes out in.
 *
 * Deliberately plain HTML with inline styles and a table for the frame: mail
 * clients are not browsers, and Outlook in particular ignores most of what a
 * page can rely on. No flexbox, no <style> block, no web fonts, no background
 * images — the parts that would degrade silently in exactly the clients most
 * customers read on their phone.
 *
 * The mark is an <img> at an absolute URL because inline SVG does not survive
 * Gmail, with the wordmark as live text beside it so the brand still reads when
 * images are blocked, which is the default in a lot of clients.
 */
export function emailShell(body: string, heading = "Nickimart"): string {
  const site = siteUrl();
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#f1f1f2;margin:0;padding:24px 12px">
    <tr><td align="center">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:520px;background:#ffffff;border-radius:12px;overflow:hidden;border:1px solid #e7e7ea">
        <tr><td style="height:4px;background:#FF6A00;font-size:0;line-height:0">&nbsp;</td></tr>
        <tr><td style="padding:24px 24px 0">
          <a href="${site}" style="text-decoration:none">
            <img src="${site}/logo.png" width="34" height="34" alt="" style="vertical-align:middle;border:0" />
            <span style="font-family:Arial,Helvetica,sans-serif;font-size:20px;font-weight:bold;color:#0B0B0B;vertical-align:middle;padding-left:8px">Nick<span style="color:#FF6A00">imart</span></span>
          </a>
        </td></tr>
        <tr><td style="padding:20px 24px 24px;font-family:Arial,Helvetica,sans-serif">
          <h1 style="font-size:18px;color:#0B0B0B;margin:0 0 10px">${heading}</h1>
          <p style="font-size:15px;color:#3f3f46;line-height:1.65;margin:0">${body}</p>
        </td></tr>
        <tr><td style="padding:0 24px 24px">
          <div style="border-top:1px solid #ededf0;padding-top:16px;font-family:Arial,Helvetica,sans-serif;font-size:12px;color:#8a8a94">
            Nickimart — Shop smart. Sell faster. Deliver closer.
          </div>
        </td></tr>
      </table>
    </td></tr>
  </table>`;
}
