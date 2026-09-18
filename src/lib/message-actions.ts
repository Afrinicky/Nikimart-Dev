"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { dataDb } from "@/lib/data-db";
import { requireAdmin } from "@/lib/session";
import { rateLimit, retryAfterLabel } from "@/lib/rate-limit";
import { findTemplate, unknownPlaceholders, type MessageScope } from "@/lib/message-templates";
import {
  broadcastAudiences,
  estimateBroadcast,
  recordBroadcast,
  sendBroadcast,
} from "@/lib/broadcasts";

/**
 * Editing the automatic messages, and sending a broadcast.
 *
 * The two halves of the Messages tab, and the difference between them is worth
 * stating: saving a template changes what future messages say, and can be
 * undone. Sending a broadcast puts words on several thousand phones and cannot
 * be. So one asks for confirmation of what it is about to do and the other
 * does not.
 */

export type MessageActionState = { ok?: boolean; error?: string; message?: string };

function str(fd: FormData, key: string): string {
  return String(fd.get(key) ?? "").trim();
}

function scopeOf(fd: FormData): MessageScope {
  return str(fd, "scope") === "retail" ? "retail" : "data";
}

// ---------------------------------------------------------------------------
// Templates
// ---------------------------------------------------------------------------

export async function saveMessageTemplate(
  _prev: MessageActionState,
  fd: FormData,
): Promise<MessageActionState> {
  const admin = await requireAdmin();
  const key = str(fd, "key");
  const template = findTemplate(key);
  if (!template) return { error: "That message doesn't exist." };

  const sms = str(fd, "sms");
  const emailSubject = str(fd, "emailSubject");
  const emailBody = str(fd, "emailBody");

  if (!sms) return { error: "The text message can't be empty. Switch it off instead." };

  // A misspelt placeholder is invisible until the message goes out with a
  // brace in it, and by then it has gone out.
  for (const [label, text] of [
    ["text message", sms],
    ["email subject", emailSubject],
    ["email", emailBody],
  ] as const) {
    const unknown = unknownPlaceholders(template, text);
    if (unknown.length > 0) {
      return {
        error: `The ${label} uses {{${unknown[0]}}}, which isn't one of this message's values.`,
      };
    }
  }

  const values = {
    sms,
    emailSubject,
    emailBody,
    smsEnabled: fd.get("smsEnabled") === "on",
    emailEnabled: template.hasEmail && fd.get("emailEnabled") === "on",
    updatedBy: admin.name ?? admin.email ?? "",
  };

  try {
    if (template.scope === "retail") {
      await prisma.messageTemplate.upsert({ where: { key }, update: values, create: { key, ...values } });
    } else {
      await dataDb.dataMessageTemplate.upsert({
        where: { key },
        update: values,
        create: { key, ...values },
      });
    }
  } catch {
    return { error: "Couldn't save that. Please try again." };
  }

  revalidatePath(template.scope === "retail" ? "/admin/messages" : "/admin/data/messages");
  return { ok: true, message: "Saved. The next message out uses this." };
}

/** Put one message back to the wording that ships with the platform. */
export async function resetMessageTemplate(fd: FormData): Promise<void> {
  await requireAdmin();
  const key = str(fd, "key");
  const template = findTemplate(key);
  if (!template) return;

  try {
    if (template.scope === "retail") await prisma.messageTemplate.delete({ where: { key } });
    else await dataDb.dataMessageTemplate.delete({ where: { key } });
  } catch {
    // Never edited; the default is already what is in force.
  }
  revalidatePath(template.scope === "retail" ? "/admin/messages" : "/admin/data/messages");
}

// ---------------------------------------------------------------------------
// Broadcasts
// ---------------------------------------------------------------------------

const broadcastSchema = z.object({
  audience: z.string().min(1),
  channel: z.enum(["sms", "email", "both"]),
  subject: z.string().trim().max(120),
  body: z.string().trim().min(5, "Write the message.").max(1000),
});

export type BroadcastState =
  | { ok?: false; error?: string }
  | { ok: true; message: string; recipients: number; delivered: number; failed: number };

export async function sendBroadcastNow(
  _prev: BroadcastState,
  fd: FormData,
): Promise<BroadcastState> {
  const admin = await requireAdmin();
  const scope = scopeOf(fd);

  const parsed = broadcastSchema.safeParse({
    audience: str(fd, "audience"),
    channel: ["sms", "email", "both"].includes(str(fd, "channel")) ? str(fd, "channel") : "sms",
    subject: str(fd, "subject"),
    body: str(fd, "body"),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Please check the message." };
  }
  const data = parsed.data;

  // A console can only address its own people, whatever the form was edited to
  // say.
  if (!broadcastAudiences(scope).some((a) => a.value === data.audience)) {
    return { error: "Choose who this is going to." };
  }
  if (data.channel !== "sms" && !data.subject) {
    return { error: "An email needs a subject." };
  }

  // Sending costs money and cannot be recalled, so the person has to have
  // seen the count and confirmed it. The number they saw travels with the
  // form; if it has moved since, they are asked again rather than surprised.
  const confirmed = Number(str(fd, "confirmedCount"));
  const estimate = await estimateBroadcast(scope, data.audience, data.body);
  if (!Number.isFinite(confirmed) || confirmed !== estimate.people) {
    return {
      error: `This now reaches ${estimate.people} ${estimate.people === 1 ? "person" : "people"} rather than ${confirmed || 0}. Check it and send again.`,
    };
  }
  if (estimate.people === 0) return { error: "Nobody is in that group right now." };

  // One broadcast at a time per admin: the button is easy to press twice, and
  // the second press is a second bill.
  const limit = await rateLimit(`broadcast:${admin.id}`, 3, 5 * 60_000);
  if (!limit.ok) {
    return {
      error: `That's three broadcasts in a few minutes. Please wait ${retryAfterLabel(limit.retryAfter)}.`,
    };
  }

  const result = await sendBroadcast({
    scope,
    audience: data.audience,
    channel: data.channel,
    subject: data.subject,
    body: data.body,
  });

  await recordBroadcast(scope, {
    audience: data.audience,
    channel: data.channel,
    subject: data.subject,
    body: data.body,
    recipients: result.recipients,
    delivered: result.delivered,
    failed: result.failed,
    sentBy: admin.name ?? admin.email ?? "",
  });

  revalidatePath(scope === "retail" ? "/admin/broadcasts" : "/admin/data/broadcasts");

  return {
    ok: true,
    ...result,
    // "Sent to 0 of 6" reads as a send that happened. When none of them landed,
    // say so in those words instead.
    message:
      result.delivered === 0 && result.recipients > 0
        ? `None of the ${result.recipients} were reached.`
        : result.failed > 0
          ? `Sent to ${result.delivered} of ${result.recipients}. ${result.failed} could not be reached.`
          : `Sent to ${result.delivered} ${result.delivered === 1 ? "person" : "people"}.`,
  };
}

/** What a broadcast would reach, for the count beside the send button. */
export async function previewBroadcast(
  scope: MessageScope,
  audience: string,
  body: string,
): Promise<{ people: number; withPhone: number; withEmail: number; segments: number; totalSegments: number; unicode: boolean }> {
  await requireAdmin();
  return estimateBroadcast(scope, audience, body);
}
