import "server-only";
import { randomUUID } from "crypto";
import { prisma } from "@/lib/prisma";
import { dataDb } from "@/lib/data-db";
import { emailShell, sendEmail, sendSms } from "@/lib/notifications";
import { paragraphs } from "@/lib/messages";
import { renderMessage, smsSegments, type MessageScope } from "@/lib/message-templates";
import { resolveAudience } from "@/lib/broadcasts";
import { normalizeGhPhone, looksLikeEmail } from "@/lib/phone";
import { dedupeKeyFor, joinTags, splitTags } from "@/lib/contact-keys";

// Re-exported so callers have one import for the contact book, even though
// the pure rules live next door where a test can reach them.
export { dedupeKeyFor, joinTags, splitTags };

/**
 * Writing to people, the ordinary way.
 *
 * The console could already send two things: a message the platform raises by
 * itself when something happens, and a broadcast to an audience worked out
 * from its own tables. Between them sat the thing anybody actually needs most
 * days and nobody could do — write to one person, or to the eleven people you
 * picked, the way you would from a phone.
 *
 * So: a contact book, a thread per contact, and one send path that both the
 * one-to-one note and the four-hundred-recipient broadcast go down. They are
 * the same operation at different widths, and building them as two would mean
 * two sets of bugs and two different answers to "did she get it?".
 *
 * Everything is scoped. Each console keeps its own contacts in its own
 * database and cannot reach the other's — an agent is not a mall customer, and
 * a mall broadcast that swept up four hundred agents by accident is the kind
 * of mistake that costs money and trust in the same afternoon.
 */

export type { MessageScope };

// ---------------------------------------------------------------------------
// Shapes
// ---------------------------------------------------------------------------

export interface Contact {
  id: string;
  name: string;
  phone: string;
  email: string;
  tags: string[];
  note: string;
  source: string;
  archived: boolean;
  lastMessageAt: Date | null;
  createdAt: Date;
}

export interface SentMessage {
  id: string;
  contactId: string | null;
  toName: string;
  toPhone: string;
  toEmail: string;
  channel: string;
  subject: string;
  body: string;
  status: string;
  smsOk: boolean | null;
  emailOk: boolean | null;
  batchId: string;
  audience: string;
  sentBy: string;
  createdAt: Date;
}

export interface Thread {
  contact: Contact;
  lastMessage: SentMessage | null;
  messageCount: number;
}

type ContactRow = {
  id: string;
  name: string;
  phone: string;
  email: string;
  tags: string;
  note: string;
  source: string;
  archived: boolean;
  lastMessageAt: Date | null;
  createdAt: Date;
};

function toContact(row: ContactRow): Contact {
  return { ...row, tags: splitTags(row.tags) };
}

// ---------------------------------------------------------------------------
// The two databases, behind one door
// ---------------------------------------------------------------------------
//
// Prisma generates a separate client per schema, so the delegates are two
// different types with the same shape. Every read and write therefore branches
// once, here, rather than everywhere upstream — the rest of the file, and all
// of the UI, never learns which console it is serving.

/**
 * Prisma generates a client per schema, so the two delegates are different
 * types that happen to have identical shapes — and a union of them is not
 * callable, because TypeScript cannot prove one argument satisfies both. The
 * narrow interfaces below say what this file actually uses, and the cast
 * happens once, here. Everything above and below works against one shape and
 * never learns which console it is serving.
 */
type Args = Record<string, unknown>;

interface ContactDelegate {
  findMany(args?: Args): Promise<ContactRow[]>;
  findUnique(args: Args): Promise<ContactRow | null>;
  count(args?: Args): Promise<number>;
  create(args: Args): Promise<ContactRow>;
  update(args: Args): Promise<ContactRow>;
  upsert(args: Args): Promise<ContactRow>;
  updateMany(args: Args): Promise<{ count: number }>;
  deleteMany(args: Args): Promise<{ count: number }>;
}

interface MessageDelegate {
  findMany(args?: Args): Promise<SentMessage[]>;
  count(args?: Args): Promise<number>;
  createMany(args: Args): Promise<{ count: number }>;
}

function contactsOf(scope: MessageScope): ContactDelegate {
  return (
    scope === "retail" ? prisma.messengerContact : dataDb.dataMessengerContact
  ) as unknown as ContactDelegate;
}

function messagesOf(scope: MessageScope): MessageDelegate {
  return (
    scope === "retail" ? prisma.messengerMessage : dataDb.dataMessengerMessage
  ) as unknown as MessageDelegate;
}

// ---------------------------------------------------------------------------
// Contacts
// ---------------------------------------------------------------------------

export interface ContactFilter {
  query?: string;
  tag?: string;
  archived?: boolean;
  page?: number;
  perPage?: number;
}

export interface ContactPage {
  contacts: Contact[];
  total: number;
}

export async function listContacts(
  scope: MessageScope,
  filter: ContactFilter = {},
): Promise<ContactPage> {
  const perPage = filter.perPage ?? 50;
  const page = Math.max(1, filter.page ?? 1);
  const q = (filter.query ?? "").trim();

  const where: Record<string, unknown> = { archived: filter.archived ?? false };
  if (q) {
    where.OR = [
      { name: { contains: q, mode: "insensitive" } },
      { phone: { contains: q } },
      { email: { contains: q, mode: "insensitive" } },
      { note: { contains: q, mode: "insensitive" } },
    ];
  }
  // A tag match has to be on the whole label, not a substring: "VIP" must not
  // pull in "VIP-lapsed", which is a different list of people.
  if (filter.tag && filter.tag !== "all") where.tags = { contains: filter.tag };

  try {
    const table = contactsOf(scope);
    const [rows, total] = await Promise.all([
      table.findMany({
        where,
        // nulls last, explicitly: Postgres sorts NULL first on a DESC, which
        // would put every contact nobody has ever written to at the top of
        // the chat list and bury the live conversations under them.
        orderBy: [{ lastMessageAt: { sort: "desc", nulls: "last" } }, { name: "asc" }],
        skip: (page - 1) * perPage,
        take: perPage,
      }),
      table.count({ where }),
    ]);
    const contacts = rows.map(toContact);
    if (!filter.tag || filter.tag === "all") return { contacts, total };

    // The `contains` above is a pre-narrowing SQL can do; this is the real
    // test, on the whole label — "VIP" must not pull in "VIP-lapsed", which
    // is a different list of people. The total is taken from the precise
    // result too, so the count on screen matches the rows under it.
    const exact = contacts.filter((c) => c.tags.includes(filter.tag!));
    return { contacts: exact, total: total - (contacts.length - exact.length) };
  } catch {
    return { contacts: [], total: 0 };
  }
}

export async function getContact(scope: MessageScope, id: string): Promise<Contact | null> {
  try {
    const row = await contactsOf(scope).findUnique({ where: { id } });
    return row ? toContact(row) : null;
  } catch {
    return null;
  }
}

/** Every tag in use, with how many contacts carry it. */
export async function listTags(scope: MessageScope): Promise<{ tag: string; count: number }[]> {
  try {
    const rows = await contactsOf(scope).findMany({
      where: { archived: false },
      select: { tags: true },
      take: 10_000,
    });
    const counts = new Map<string, number>();
    for (const r of rows) {
      for (const t of splitTags(r.tags)) counts.set(t, (counts.get(t) ?? 0) + 1);
    }
    return [...counts.entries()]
      .map(([tag, count]) => ({ tag, count }))
      .sort((a, b) => b.count - a.count || a.tag.localeCompare(b.tag));
  } catch {
    return [];
  }
}

export interface ContactInput {
  id?: string;
  name: string;
  phone: string;
  email: string;
  tags: string;
  note: string;
  source?: string;
}

export type SaveContactResult = { ok: true; id: string } | { ok: false; error: string };

export async function saveContact(
  scope: MessageScope,
  input: ContactInput,
): Promise<SaveContactResult> {
  const name = input.name.trim();
  const phone = input.phone.trim();
  const email = input.email.trim();
  if (!name) return { ok: false, error: "A contact needs a name." };

  const key = dedupeKeyFor(phone, email);
  if (!key) return { ok: false, error: "A phone number or an email address, please — one of them." };
  if (email && !looksLikeEmail(email)) return { ok: false, error: "That email address doesn't look right." };

  const values = {
    name,
    phone,
    email,
    tags: joinTags(splitTags(input.tags)),
    note: input.note.trim(),
    dedupeKey: key,
  };

  try {
    const table = contactsOf(scope);
    if (input.id) {
      // Editing somebody into a number another contact already holds would
      // break the unique key; say so in words rather than throwing.
      const clash = await table.findUnique({ where: { dedupeKey: key }, select: { id: true } });
      if (clash && clash.id !== input.id) {
        return { ok: false, error: "Another contact already has that number or address." };
      }
      const row = await table.update({ where: { id: input.id }, data: values });
      return { ok: true, id: row.id };
    }
    const row = await table.upsert({
      where: { dedupeKey: key },
      update: values,
      create: { ...values, source: input.source ?? "manual" },
    });
    return { ok: true, id: row.id };
  } catch {
    return { ok: false, error: "Couldn't save that contact. Please try again." };
  }
}

/** Archive rather than delete: the thread is the record of what was said. */
export async function archiveContacts(
  scope: MessageScope,
  ids: string[],
  archived: boolean,
): Promise<number> {
  if (ids.length === 0) return 0;
  try {
    const res = await contactsOf(scope).updateMany({ where: { id: { in: ids } }, data: { archived } });
    return res.count;
  } catch {
    return 0;
  }
}

export async function deleteContacts(scope: MessageScope, ids: string[]): Promise<number> {
  if (ids.length === 0) return 0;
  try {
    const res = await contactsOf(scope).deleteMany({ where: { id: { in: ids } } });
    return res.count;
  } catch {
    return 0;
  }
}

/** Add one tag to several contacts at once — how a group gets made. */
export async function tagContacts(
  scope: MessageScope,
  ids: string[],
  tag: string,
): Promise<number> {
  const label = tag.trim();
  if (!label || ids.length === 0) return 0;
  try {
    const table = contactsOf(scope);
    const rows = await table.findMany({ where: { id: { in: ids } }, select: { id: true, tags: true } });
    let changed = 0;
    for (const row of rows) {
      const tags = splitTags(row.tags);
      if (tags.includes(label)) continue;
      await table.update({ where: { id: row.id }, data: { tags: joinTags([...tags, label]) } });
      changed += 1;
    }
    return changed;
  } catch {
    return 0;
  }
}

// ---------------------------------------------------------------------------
// Threads
// ---------------------------------------------------------------------------

/**
 * The chat list: who has been written to, most recent first.
 *
 * `lastMessageAt` is denormalised onto the contact precisely so this read is
 * one query and a sort rather than a group-by over every message ever sent.
 * Contacts nobody has written to yet come after the ones who have, which is
 * the order a messaging app puts them in and the order people expect.
 */
export async function listThreads(
  scope: MessageScope,
  options: { query?: string; take?: number } = {},
): Promise<Thread[]> {
  const take = options.take ?? 60;
  const { contacts } = await listContacts(scope, {
    query: options.query,
    perPage: take,
    archived: false,
  });
  if (contacts.length === 0) return [];

  try {
    const ids = contacts.map((c) => c.id);
    const recent = await messagesOf(scope).findMany({
      where: { contactId: { in: ids } },
      orderBy: { createdAt: "desc" },
      take: take * 4,
    });
    const last = new Map<string, SentMessage>();
    const counts = new Map<string, number>();
    for (const m of recent) {
      if (!m.contactId) continue;
      if (!last.has(m.contactId)) last.set(m.contactId, m as SentMessage);
      counts.set(m.contactId, (counts.get(m.contactId) ?? 0) + 1);
    }
    return contacts.map((contact) => ({
      contact,
      lastMessage: last.get(contact.id) ?? null,
      messageCount: counts.get(contact.id) ?? 0,
    }));
  } catch {
    return contacts.map((contact) => ({ contact, lastMessage: null, messageCount: 0 }));
  }
}

export async function listThreadMessages(
  scope: MessageScope,
  contactId: string,
  take = 200,
): Promise<SentMessage[]> {
  try {
    const rows = await messagesOf(scope).findMany({
      where: { contactId },
      orderBy: { createdAt: "asc" },
      take,
    });
    return rows as SentMessage[];
  } catch {
    return [];
  }
}

/** Everything sent lately, whoever it went to — the Sent folder. */
export async function listRecentMessages(scope: MessageScope, take = 100): Promise<SentMessage[]> {
  try {
    const rows = await messagesOf(scope).findMany({ orderBy: { createdAt: "desc" }, take });
    return rows as SentMessage[];
  } catch {
    return [];
  }
}

// ---------------------------------------------------------------------------
// Sending
// ---------------------------------------------------------------------------

export interface Recipient {
  contactId: string | null;
  name: string;
  phone: string;
  email: string;
}

export interface SendResult {
  recipients: number;
  delivered: number;
  failed: number;
  batchId: string;
}

/**
 * Send one message to however many people, and write down what happened.
 *
 * In batches, because a few hundred simultaneous calls to one gateway is how a
 * provider starts refusing them, and a send half refused is worse than one
 * that takes a minute.
 *
 * One row per recipient rather than one row with a count. It costs rows and
 * buys the only answer that matters when somebody says they never got it:
 * their row, and whether the gateway took it.
 *
 * `{{name}}` is filled per recipient, so "Hi {{name}}" to four hundred people
 * is four hundred different messages — the same courtesy the automatic
 * messages already extend.
 */
export async function sendMessage(input: {
  scope: MessageScope;
  recipients: Recipient[];
  channel: "sms" | "email" | "both";
  subject: string;
  body: string;
  sentBy: string;
  /** Set on a broadcast so the history can say what it was aimed at. */
  audience?: string;
}): Promise<SendResult> {
  const batchId = input.recipients.length > 1 ? randomUUID() : "";
  let delivered = 0;
  let failed = 0;
  const touched: string[] = [];

  const BATCH = 20;
  for (let i = 0; i < input.recipients.length; i += BATCH) {
    const slice = input.recipients.slice(i, i + BATCH);
    const outcomes = await Promise.all(
      slice.map(async (person) => {
        const first = person.name.split(" ")[0] || "there";
        const text = renderMessage(input.body, { name: first });
        const subject = renderMessage(input.subject || "Nickimart", { name: first });

        let smsOk: boolean | null = null;
        let emailOk: boolean | null = null;

        if (person.phone && input.channel !== "email") {
          smsOk = await sendSms(person.phone, text).catch(() => false);
        }
        if (person.email && input.channel !== "sms") {
          // The same house frame every other Nickimart email goes out in —
          // a message from the console must not look like a different company.
          emailOk = await sendEmail(person.email, subject, emailShell(paragraphs(text), subject)).catch(
            () => false,
          );
        }

        const attempted = [smsOk, emailOk].filter((v) => v !== null) as boolean[];
        const ok = attempted.some(Boolean);
        const status = attempted.length === 0 ? "failed" : ok ? (attempted.every(Boolean) ? "sent" : "partial") : "failed";

        return { person, text, subject, smsOk, emailOk, status, ok };
      }),
    );

    for (const o of outcomes) {
      if (o.ok) delivered += 1;
      else failed += 1;
      if (o.person.contactId) touched.push(o.person.contactId);
    }

    // Recorded after the batch rather than per message: one round trip for
    // twenty rows, and a gateway that stalls does not hold a transaction open.
    try {
      await messagesOf(input.scope).createMany({
        data: outcomes.map((o) => ({
          contactId: o.person.contactId,
          toName: o.person.name,
          toPhone: o.person.phone,
          toEmail: o.person.email,
          channel: input.channel,
          subject: input.channel === "sms" ? "" : o.subject,
          body: o.text,
          status: o.status,
          smsOk: o.smsOk,
          emailOk: o.emailOk,
          batchId,
          audience: input.audience ?? "",
          sentBy: input.sentBy,
        })),
      });
    } catch {
      // The messages went out. Failing to log them must not report a failure.
    }
  }

  if (touched.length > 0) {
    await contactsOf(input.scope)
      .updateMany({ where: { id: { in: [...new Set(touched)] } }, data: { lastMessageAt: new Date() } })
      .catch(() => undefined);
  }

  return { recipients: input.recipients.length, delivered, failed, batchId };
}

/** What a send will cost, before it is sent. */
export function estimate(recipients: Recipient[], body: string, channel: string) {
  const withPhone = recipients.filter((r) => r.phone).length;
  const withEmail = recipients.filter((r) => r.email).length;
  const { segments, unicode } = smsSegments(body);
  return {
    people: recipients.length,
    withPhone: channel === "email" ? 0 : withPhone,
    withEmail: channel === "sms" ? 0 : withEmail,
    segments,
    unicode,
    totalSegments: channel === "email" ? 0 : segments * withPhone,
  };
}

/** Turn whatever the composer collected into people to send to. */
export async function resolveRecipients(
  scope: MessageScope,
  input: { contactIds?: string[]; tags?: string[]; audience?: string; raw?: string },
): Promise<Recipient[]> {
  const out = new Map<string, Recipient>();
  const add = (r: Recipient) => {
    const key = dedupeKeyFor(r.phone, r.email);
    if (!key) return;
    if (!out.has(key)) out.set(key, r);
  };

  if (input.contactIds?.length) {
    const rows = await contactsOf(scope)
      .findMany({ where: { id: { in: input.contactIds } } })
      .catch(() => []);
    for (const c of rows) add({ contactId: c.id, name: c.name, phone: c.phone, email: c.email });
  }

  if (input.tags?.length) {
    const rows = await contactsOf(scope)
      .findMany({ where: { archived: false }, take: 10_000 })
      .catch(() => []);
    for (const c of rows) {
      const tags = splitTags(c.tags);
      if (input.tags.some((t) => tags.includes(t))) {
        add({ contactId: c.id, name: c.name, phone: c.phone, email: c.email });
      }
    }
  }

  if (input.audience && input.audience !== "none") {
    // The platform's own audiences — customers, agents, shops — resolved by
    // the same code the broadcast tab has always used.
    for (const p of await resolveAudience(scope, input.audience)) {
      add({ contactId: null, name: p.name, phone: p.phone ?? "", email: p.email ?? "" });
    }
  }

  if (input.raw?.trim()) {
    // Numbers and addresses typed straight into the To box, the way you'd
    // text somebody who is not in your contacts.
    for (const piece of input.raw.split(/[,;\n]+/)) {
      const value = piece.trim();
      if (!value) continue;
      if (looksLikeEmail(value)) add({ contactId: null, name: "there", phone: "", email: value });
      else {
        const phone = normalizeGhPhone(value);
        if (phone) add({ contactId: null, name: "there", phone, email: "" });
      }
    }
  }

  return [...out.values()];
}

/**
 * One bulk send, folded back up from its rows.
 *
 * The rows are per recipient so a single person's delivery can be answered
 * for; the history people want to read is per send. Grouping here rather than
 * storing a second summary row means the two can never disagree about how
 * many were reached.
 */
export interface Batch {
  id: string;
  subject: string;
  body: string;
  channel: string;
  audience: string;
  sentBy: string;
  createdAt: Date;
  recipients: number;
  delivered: number;
  failed: number;
}

export async function listBatches(scope: MessageScope, take = 40): Promise<Batch[]> {
  try {
    // Enough rows to cover the recent batches without reading the whole table;
    // a broadcast is a few hundred rows, so this is the last several of them.
    const rows = await messagesOf(scope).findMany({
      where: { NOT: { batchId: "" } },
      orderBy: { createdAt: "desc" },
      take: 5000,
    });

    const byBatch = new Map<string, Batch>();
    for (const m of rows) {
      let batch = byBatch.get(m.batchId);
      if (!batch) {
        if (byBatch.size >= take) continue;
        batch = {
          id: m.batchId,
          subject: m.subject,
          body: m.body,
          channel: m.channel,
          audience: m.audience,
          sentBy: m.sentBy,
          createdAt: m.createdAt,
          recipients: 0,
          delivered: 0,
          failed: 0,
        };
        byBatch.set(m.batchId, batch);
      }
      batch.recipients += 1;
      if (m.status === "failed") batch.failed += 1;
      else batch.delivered += 1;
      // The batch is stamped with its earliest row, so a send that took a
      // minute reads as one moment rather than drifting.
      if (m.createdAt < batch.createdAt) batch.createdAt = m.createdAt;
    }

    return [...byBatch.values()].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  } catch {
    return [];
  }
}

// ---------------------------------------------------------------------------
// Import, export, and pulling people in
// ---------------------------------------------------------------------------

export interface ImportRow {
  name: string;
  phone: string;
  email: string;
  tags: string;
  note: string;
}

export interface ImportResult {
  added: number;
  updated: number;
  skipped: number;
  /** The first few reasons, for the admin to look at. */
  problems: string[];
}

/**
 * Take a spreadsheet of people and make them contacts.
 *
 * Updates rather than duplicates, because the realistic use is a list that
 * someone keeps in Excel and re-uploads when it changes. A row with neither a
 * usable phone nor an email is skipped and said so — silently dropping forty
 * rows out of four hundred is how a broadcast quietly misses a tenth of its
 * audience.
 */
export async function importContacts(
  scope: MessageScope,
  rows: ImportRow[],
  source = "import",
): Promise<ImportResult> {
  const result: ImportResult = { added: 0, updated: 0, skipped: 0, problems: [] };
  const table = contactsOf(scope);
  const seen = new Set<string>();

  for (const [i, row] of rows.entries()) {
    const line = i + 2; // +1 for zero-index, +1 for the header row
    const name = row.name.trim();
    const phone = row.phone.trim();
    const email = row.email.trim();
    const key = dedupeKeyFor(phone, email);

    if (!key) {
      result.skipped += 1;
      if (result.problems.length < 5) {
        result.problems.push(`Row ${line}${name ? ` (${name})` : ""}: no usable phone or email.`);
      }
      continue;
    }
    if (seen.has(key)) {
      result.skipped += 1;
      continue;
    }
    seen.add(key);

    try {
      const existing = await table.findUnique({ where: { dedupeKey: key }, select: { id: true } });
      const values = {
        name: name || phone || email,
        phone,
        email,
        tags: joinTags(splitTags(row.tags)),
        note: row.note.trim(),
        dedupeKey: key,
      };
      if (existing) {
        await table.update({ where: { id: existing.id }, data: values });
        result.updated += 1;
      } else {
        await table.create({ data: { ...values, source } });
        result.added += 1;
      }
    } catch {
      result.skipped += 1;
      if (result.problems.length < 5) result.problems.push(`Row ${line}: couldn't be saved.`);
    }
  }

  return result;
}

/**
 * Copy one of the platform's own audiences into the contact book.
 *
 * So a broadcast to "agents with money owed" can become a list you then edit,
 * tag and write to by hand — which is what people do with an audience once
 * they have used it twice.
 */
export async function pullInAudience(
  scope: MessageScope,
  audience: string,
  tag: string,
): Promise<ImportResult> {
  const people = await resolveAudience(scope, audience);
  return importContacts(
    scope,
    people.map((p) => ({
      name: p.name,
      phone: p.phone ?? "",
      email: p.email ?? "",
      tags: tag,
      note: "",
    })),
    audience,
  );
}

/** Every contact, as rows for a spreadsheet. */
export async function contactRows(scope: MessageScope): Promise<(string | Date)[][]> {
  try {
    const rows = await contactsOf(scope).findMany({
      orderBy: { name: "asc" },
      take: 20_000,
    });
    return rows.map((c) => [
      c.name,
      c.phone,
      c.email,
      joinTags(splitTags(c.tags)),
      c.note,
      c.archived ? "Yes" : "No",
      c.source,
      c.createdAt,
    ]);
  } catch {
    return [];
  }
}

export const CONTACT_COLUMNS = [
  "Name",
  "Phone",
  "Email",
  "Groups",
  "Note",
  "Archived",
  "Added from",
  "Added on",
];

// ---------------------------------------------------------------------------
// The numbers across the top of the Messenger
// ---------------------------------------------------------------------------

export interface MessengerStats {
  contacts: number;
  groups: number;
  sentThisMonth: number;
  failedThisMonth: number;
}

export async function messengerStats(scope: MessageScope): Promise<MessengerStats> {
  const monthStart = new Date();
  monthStart.setDate(1);
  monthStart.setHours(0, 0, 0, 0);

  try {
    const [contacts, tags, sent, failed] = await Promise.all([
      contactsOf(scope).count({ where: { archived: false } }),
      listTags(scope),
      messagesOf(scope).count({ where: { createdAt: { gte: monthStart } } }),
      messagesOf(scope).count({ where: { createdAt: { gte: monthStart }, status: "failed" } }),
    ]);
    return { contacts, groups: tags.length, sentThisMonth: sent, failedThisMonth: failed };
  } catch {
    return { contacts: 0, groups: 0, sentThisMonth: 0, failedThisMonth: 0 };
  }
}
