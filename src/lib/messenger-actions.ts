"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireAdmin } from "@/lib/session";
import { rateLimit, retryAfterLabel } from "@/lib/rate-limit";
import { broadcastAudiences } from "@/lib/broadcasts";
import { readSpreadsheet, mapColumns } from "@/lib/xlsx-read";
import type { MessageScope } from "@/lib/message-templates";
import {
  archiveContacts,
  deleteContacts,
  estimate,
  importContacts,
  pullInAudience,
  resolveRecipients,
  saveContact,
  sendMessage,
  tagContacts,
  type ImportRow,
} from "@/lib/messenger";

/**
 * Everything the Messenger does on the server.
 *
 * The rule that shapes all of it: sending costs money per recipient and cannot
 * be recalled. So a send to more than a handful of people has to have been
 * counted and confirmed first, the count travels with the form, and a count
 * that has moved since refuses rather than surprises. Saving a contact is the
 * opposite — cheap, reversible, and asks nothing.
 */

export type MessengerState = { ok?: boolean; error?: string; message?: string };

function str(fd: FormData, key: string): string {
  return String(fd.get(key) ?? "").trim();
}

function scopeOf(fd: FormData): MessageScope {
  return str(fd, "scope") === "retail" ? "retail" : "data";
}

function paths(scope: MessageScope): string[] {
  const base = scope === "retail" ? "/admin" : "/admin/data";
  return [`${base}/messenger`, `${base}/messenger/contacts`, `${base}/broadcasts`];
}

function refresh(scope: MessageScope): void {
  for (const path of paths(scope)) revalidatePath(path);
}

// ---------------------------------------------------------------------------
// Contacts
// ---------------------------------------------------------------------------

export async function saveContactAction(
  _prev: MessengerState,
  fd: FormData,
): Promise<MessengerState> {
  await requireAdmin();
  const scope = scopeOf(fd);
  const id = str(fd, "id");

  const result = await saveContact(scope, {
    id: id || undefined,
    name: str(fd, "name"),
    phone: str(fd, "phone"),
    email: str(fd, "email"),
    tags: str(fd, "tags"),
    note: str(fd, "note"),
  });
  if (!result.ok) return { error: result.error };

  refresh(scope);
  return { ok: true, message: id ? "Saved." : "Contact added." };
}

/**
 * Archive, restore, delete or tag a selection at once.
 *
 * One action rather than four, because the UI is one row of buttons over a set
 * of ticked boxes and splitting it would mean four near-identical guards.
 */
export async function bulkContactAction(
  _prev: MessengerState,
  fd: FormData,
): Promise<MessengerState> {
  await requireAdmin();
  const scope = scopeOf(fd);
  const ids = fd.getAll("ids").map(String).filter(Boolean);
  const what = str(fd, "what");

  if (ids.length === 0) return { error: "Tick the contacts first." };

  if (what === "archive" || what === "restore") {
    const n = await archiveContacts(scope, ids, what === "archive");
    refresh(scope);
    return {
      ok: true,
      message: `${n} ${n === 1 ? "contact" : "contacts"} ${what === "archive" ? "archived" : "restored"}.`,
    };
  }

  if (what === "delete") {
    // Deleting keeps the messages: they are snapshotted with the recipient's
    // name and number, so the record of what was said survives the contact.
    const n = await deleteContacts(scope, ids);
    refresh(scope);
    return { ok: true, message: `${n} ${n === 1 ? "contact" : "contacts"} deleted.` };
  }

  if (what === "tag") {
    const tag = str(fd, "tag");
    if (!tag) return { error: "Name the group first." };
    const n = await tagContacts(scope, ids, tag);
    refresh(scope);
    return { ok: true, message: `${n} added to ${tag}.` };
  }

  return { error: "Nothing to do." };
}

/**
 * Read an uploaded spreadsheet into the contact book.
 *
 * Columns are matched by what the header says rather than by position, because
 * nobody's spreadsheet is in this console's order and asking them to rearrange
 * it is how an import feature goes unused.
 */
export async function importContactsAction(
  _prev: MessengerState,
  fd: FormData,
): Promise<MessengerState> {
  await requireAdmin();
  const scope = scopeOf(fd);
  const file = fd.get("file");

  if (!(file instanceof File) || file.size === 0) return { error: "Choose a file first." };
  if (file.size > 8 * 1024 * 1024) return { error: "That file is too big — 8MB is the limit." };

  let sheet;
  try {
    sheet = readSpreadsheet(file.name, Buffer.from(await file.arrayBuffer()));
  } catch {
    sheet = null;
  }
  if (!sheet || sheet.rows.length === 0) {
    return { error: "Couldn't read any rows from that file. Save it as .xlsx or .csv and try again." };
  }

  const cols = mapColumns(sheet.header);
  const at = (row: string[], i: number) => (i >= 0 ? (row[i] ?? "") : "");
  const extraTag = str(fd, "tag");

  const rows: ImportRow[] = sheet.rows.map((row) => ({
    name: at(row, cols.name),
    phone: at(row, cols.phone),
    email: at(row, cols.email),
    tags: [at(row, cols.tags), extraTag].filter(Boolean).join(", "),
    note: at(row, cols.note),
  }));

  const result = await importContacts(scope, rows);
  refresh(scope);

  const parts = [`${result.added} added`, `${result.updated} updated`];
  if (result.skipped > 0) parts.push(`${result.skipped} skipped`);
  return {
    ok: true,
    message: `${parts.join(", ")}.${result.problems.length > 0 ? ` ${result.problems.join(" ")}` : ""}`,
  };
}

/** Copy one of the platform's own audiences into the contact book. */
export async function pullInAudienceAction(
  _prev: MessengerState,
  fd: FormData,
): Promise<MessengerState> {
  await requireAdmin();
  const scope = scopeOf(fd);
  const audience = str(fd, "audience");
  if (!broadcastAudiences(scope).some((a) => a.value === audience)) {
    return { error: "Choose who to bring in." };
  }

  const label = broadcastAudiences(scope).find((a) => a.value === audience)?.label ?? audience;
  const result = await pullInAudience(scope, audience, str(fd, "tag") || label);
  refresh(scope);

  if (result.added + result.updated === 0) return { error: "Nobody is in that group right now." };
  return {
    ok: true,
    message: `${result.added} added, ${result.updated} already here${result.skipped > 0 ? `, ${result.skipped} had no number or address` : ""}.`,
  };
}

// ---------------------------------------------------------------------------
// Sending
// ---------------------------------------------------------------------------

const sendSchema = z.object({
  channel: z.enum(["sms", "email", "both"]),
  subject: z.string().trim().max(150),
  body: z.string().trim().min(2, "Write the message.").max(2000),
});

export type SendState =
  | { ok?: false; error?: string }
  | { ok: true; message: string; recipients: number; delivered: number; failed: number };

/**
 * Send what is in the composer.
 *
 * One action for the note to one person and the broadcast to four hundred,
 * because they are the same operation at different widths. The difference is
 * the confirmation: a send to more than `CONFIRM_ABOVE` people has to carry
 * the count the sender was shown, and is refused if the audience has moved
 * since. Below that it just sends — asking somebody to confirm a text to one
 * contact is the kind of friction that makes people use their own phone
 * instead, which is how a business loses its record of what it said.
 */
const CONFIRM_ABOVE = 5;

export async function sendMessengerMessage(_prev: SendState, fd: FormData): Promise<SendState> {
  const admin = await requireAdmin();
  const scope = scopeOf(fd);

  const parsed = sendSchema.safeParse({
    channel: ["sms", "email", "both"].includes(str(fd, "channel")) ? str(fd, "channel") : "sms",
    subject: str(fd, "subject"),
    body: str(fd, "body"),
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Please check the message." };
  const data = parsed.data;

  const audience = str(fd, "audience");
  if (audience && audience !== "none" && !broadcastAudiences(scope).some((a) => a.value === audience)) {
    return { error: "That group isn't one this console can write to." };
  }

  const recipients = await resolveRecipients(scope, {
    contactIds: fd.getAll("contactIds").map(String).filter(Boolean),
    tags: fd.getAll("tags").map(String).filter(Boolean),
    audience: audience || undefined,
    raw: str(fd, "to"),
  });

  if (recipients.length === 0) return { error: "Nobody to send this to yet." };
  if (data.channel !== "sms" && !data.subject) return { error: "An email needs a subject." };

  const reachable = recipients.filter((r) =>
    data.channel === "email" ? r.email : data.channel === "sms" ? r.phone : r.phone || r.email,
  );
  if (reachable.length === 0) {
    return {
      error:
        data.channel === "email"
          ? "None of them has an email address."
          : "None of them has a phone number.",
    };
  }

  if (reachable.length > CONFIRM_ABOVE) {
    const confirmed = Number(str(fd, "confirmedCount"));
    if (!Number.isFinite(confirmed) || confirmed !== reachable.length) {
      return {
        error: `This now reaches ${reachable.length} ${reachable.length === 1 ? "person" : "people"} rather than ${confirmed || 0}. Check it and send again.`,
      };
    }
    // The button is easy to press twice, and the second press is a second bill.
    const limit = await rateLimit(`messenger:${admin.id}`, 6, 5 * 60_000);
    if (!limit.ok) {
      return { error: `That's six bulk sends in a few minutes. Please wait ${retryAfterLabel(limit.retryAfter)}.` };
    }
  }

  const result = await sendMessage({
    scope,
    recipients: reachable,
    channel: data.channel,
    subject: data.subject,
    body: data.body,
    sentBy: admin.name ?? admin.email ?? "",
    audience: audience && audience !== "none" ? audience : "",
  });

  refresh(scope);

  return {
    ok: true,
    recipients: result.recipients,
    delivered: result.delivered,
    failed: result.failed,
    // "Sent to 0 of 6" reads as a send that happened. When none of them landed,
    // say so in those words instead.
    message:
      result.delivered === 0
        ? `None of the ${result.recipients} were reached.`
        : result.failed > 0
          ? `Sent to ${result.delivered} of ${result.recipients}. ${result.failed} could not be reached.`
          : `Sent to ${result.delivered} ${result.delivered === 1 ? "person" : "people"}.`,
  };
}

/** What a send would reach and cost, for the line above the send button. */
export async function previewSend(
  scope: MessageScope,
  input: { contactIds?: string[]; tags?: string[]; audience?: string; raw?: string },
  body: string,
  channel: string,
) {
  await requireAdmin();
  const recipients = await resolveRecipients(scope, input);
  const reachable = recipients.filter((r) =>
    channel === "email" ? r.email : channel === "sms" ? r.phone : r.phone || r.email,
  );
  return { ...estimate(recipients, body, channel), reachable: reachable.length };
}
