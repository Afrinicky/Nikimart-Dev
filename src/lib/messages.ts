import "server-only";
import { cache } from "react";
import { prisma } from "@/lib/prisma";
import { emailShell, sendEmail, sendSms, type Recipient } from "@/lib/notifications";
import { dataDb } from "@/lib/data-db";
import {
  findTemplate,
  renderMessage,
  templatesFor,
  type MessageScope,
  type MessageTemplate,
} from "@/lib/message-templates";

/**
 * Turning a template key and some values into the words that go out.
 *
 * Every automatic send goes through here, which is the whole point: the text
 * an admin edits in the console and the text a customer receives are then the
 * same string, and cannot drift. Where the admin has not edited anything the
 * default in the registry stands, so an empty database sends exactly what it
 * always sent.
 *
 * It never throws. A message is a side effect of something that already
 * happened — an order delivered, a payout sent — and a template lookup failing
 * must not undo it. Unknown key, unreachable database, blank override: the
 * worst case is the message somebody would have got before any of this
 * existed.
 */

export interface ResolvedMessage {
  sms: string | null;
  emailSubject: string | null;
  emailBody: string | null;
}

interface Override {
  sms: string;
  emailSubject: string;
  emailBody: string;
  smsEnabled: boolean;
  emailEnabled: boolean;
  updatedBy: string;
  updatedAt: Date;
}

/**
 * Every override for one console, read once per request.
 *
 * One query rather than one per message: an order that notifies a buyer, a
 * seller and three admins would otherwise make five round trips for text that
 * changes about twice a year.
 */
const overridesFor = cache(async (scope: MessageScope): Promise<Map<string, Override>> => {
  try {
    const rows =
      scope === "retail"
        ? await prisma.messageTemplate.findMany()
        : await dataDb.dataMessageTemplate.findMany();
    return new Map(rows.map((r) => [r.key, r as Override]));
  } catch {
    // Not migrated, or briefly unreachable. The defaults are a complete set.
    return new Map();
  }
});

/**
 * The message for one key, with the placeholders filled.
 *
 * A null half means "do not send that channel" — either because the template
 * has no email at all, or because an admin switched it off.
 */
export async function resolveMessage(
  key: string,
  vars: Record<string, string | number> = {},
): Promise<ResolvedMessage> {
  const template = findTemplate(key);
  if (!template) return { sms: null, emailSubject: null, emailBody: null };

  const override = (await overridesFor(template.scope)).get(key);

  const smsText = pick(override?.sms, template.sms);
  const subject = pick(override?.emailSubject, template.emailSubject ?? "");
  const body = pick(override?.emailBody, template.emailBody ?? "");

  const smsOn = override ? override.smsEnabled : true;
  const emailOn = template.hasEmail && (override ? override.emailEnabled : true);

  return {
    sms: smsOn && smsText ? renderMessage(smsText, vars) : null,
    emailSubject: emailOn && subject ? renderMessage(subject, vars) : null,
    emailBody: emailOn && body ? renderMessage(body, vars) : null,
  };
}

/** An override only counts when it has something in it. */
function pick(override: string | undefined, fallback: string): string {
  const value = (override ?? "").trim();
  return value || fallback;
}

export interface TemplateView extends MessageTemplate {
  /** What is actually in force, default or override. */
  currentSms: string;
  currentSubject: string;
  currentBody: string;
  smsEnabled: boolean;
  emailEnabled: boolean;
  /** True when an admin has changed it from the default. */
  edited: boolean;
  updatedBy: string;
  updatedAt: Date | null;
}

/** Every template for one console, with whatever the admin has done to it. */
export async function listTemplates(scope: MessageScope): Promise<TemplateView[]> {
  const overrides = await overridesFor(scope);
  return templatesFor(scope).map((t) => {
    const o = overrides.get(t.key);
    return {
      ...t,
      currentSms: pick(o?.sms, t.sms),
      currentSubject: pick(o?.emailSubject, t.emailSubject ?? ""),
      currentBody: pick(o?.emailBody, t.emailBody ?? ""),
      smsEnabled: o ? o.smsEnabled : true,
      emailEnabled: t.hasEmail && (o ? o.emailEnabled : true),
      edited: Boolean(o),
      updatedBy: o?.updatedBy ?? "",
      updatedAt: o?.updatedAt ?? null,
    };
  });
}

export async function getTemplateView(key: string): Promise<TemplateView | null> {
  const template = findTemplate(key);
  if (!template) return null;
  const all = await listTemplates(template.scope);
  return all.find((t) => t.key === key) ?? null;
}

// ---------------------------------------------------------------------------
// Sending one
// ---------------------------------------------------------------------------

/**
 * Send an automatic message by its key.
 *
 * The one call every automatic send should make. It resolves the template,
 * fills it, and hands it to the transport — so an admin's edit reaches the
 * next message out without anybody touching the code that sends it.
 *
 * A channel the admin has switched off is simply not attempted. That is the
 * difference between "we sent an empty SMS" and "we did not send an SMS".
 */
export async function notifyTemplate(
  to: Recipient,
  key: string,
  vars: Record<string, string | number> = {},
): Promise<void> {
  const message = await resolveMessage(key, vars);
  if (!message.sms && !message.emailSubject) return;

  const tasks: Promise<unknown>[] = [];
  if (to.phone && message.sms) tasks.push(sendSms(to.phone, message.sms));
  if (to.email && message.emailSubject) {
    tasks.push(
      sendEmail(
        to.email,
        message.emailSubject,
        emailShell(paragraphs(message.emailBody ?? message.sms ?? ""), message.emailSubject),
      ),
    );
  }
  await Promise.allSettled(tasks);
}

/** The SMS half alone, for the sends that have no email address to use. */
export async function smsTemplate(
  phone: string | null | undefined,
  key: string,
  vars: Record<string, string | number> = {},
): Promise<void> {
  if (!phone) return;
  const { sms } = await resolveMessage(key, vars);
  if (!sms) return;
  await sendSms(phone, sms);
}

/**
 * Plain text into the paragraphs the email shell expects.
 *
 * Admins write in a textarea with blank lines between paragraphs, the way
 * anybody writes. Escaped first, because what they typed is text and must
 * never become markup.
 */
export function paragraphs(text: string): string {
  return text
    .split(/\n{2,}/)
    .map((p) => `<p>${escapeHtml(p).replace(/\n/g, "<br>")}</p>`)
    .join("");
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
