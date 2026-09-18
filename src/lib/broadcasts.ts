import "server-only";
import { prisma } from "@/lib/prisma";
import { dataDb } from "@/lib/data-db";
import { emailShell, sendEmail, sendSms } from "@/lib/notifications";
import { paragraphs } from "@/lib/messages";
import { renderMessage, smsSegments } from "@/lib/message-templates";
import type { MessageScope } from "@/lib/message-templates";

/**
 * Sending a message to a group of people on purpose.
 *
 * Unlike an announcement, which sits on a screen until somebody opens it, a
 * broadcast leaves the building: it costs money per recipient, it arrives on a
 * phone at whatever hour it was sent, and it cannot be recalled. So three
 * things are built in rather than bolted on — the audience is resolved and
 * counted *before* anything is sent, the cost is stated in SMS parts rather
 * than characters, and every send is recorded with what went out and who sent
 * it.
 *
 * Each console addresses its own people from its own database. There is no
 * audience here that can reach the other side's.
 */

export interface AudienceOption {
  value: string;
  label: string;
  note: string;
}

export const DATA_BROADCAST_AUDIENCES: AudienceOption[] = [
  { value: "agents.all", label: "All agents", note: "Everyone with a storefront." },
  { value: "agents.active", label: "Active agents", note: "Not suspended." },
  { value: "agents.owed", label: "Agents with money owed", note: "A balance they could withdraw." },
  {
    value: "agents.dormant",
    label: "Agents who have never signed in",
    note: "Registered but never opened the console.",
  },
  {
    value: "buyers.recent",
    label: "Recent bundle buyers",
    note: "Anyone who bought in the last 90 days.",
  },
];

export const RETAIL_BROADCAST_AUDIENCES: AudienceOption[] = [
  { value: "customers.all", label: "All customers", note: "Everyone with an account." },
  {
    value: "customers.recent",
    label: "Recent customers",
    note: "Anyone who ordered in the last 90 days.",
  },
  { value: "vendors.all", label: "All shops", note: "Every shop owner." },
  { value: "affiliates.all", label: "All affiliates", note: "Everyone on the affiliate programme." },
];

export function broadcastAudiences(scope: MessageScope): AudienceOption[] {
  return scope === "data" ? DATA_BROADCAST_AUDIENCES : RETAIL_BROADCAST_AUDIENCES;
}

export interface BroadcastRecipient {
  phone: string | null;
  email: string | null;
  /** Filled into {{name}} so a broadcast can still greet somebody by name. */
  name: string;
}

function ninetyDaysAgo(): Date {
  const d = new Date();
  d.setDate(d.getDate() - 90);
  return d;
}

/** Who one audience actually is, right now. Deduplicated by phone and email. */
export async function resolveAudience(
  scope: MessageScope,
  audience: string,
): Promise<BroadcastRecipient[]> {
  try {
    const people = scope === "data" ? await dataAudience(audience) : await retailAudience(audience);
    const seen = new Set<string>();
    return people.filter((p) => {
      const key = `${p.phone ?? ""}|${(p.email ?? "").toLowerCase()}`;
      if (key === "|" || seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  } catch {
    return [];
  }
}

async function dataAudience(audience: string): Promise<BroadcastRecipient[]> {
  if (audience === "buyers.recent") {
    const orders = await dataDb.dataOrder.findMany({
      where: { paymentStatus: "paid", createdAt: { gte: ninetyDaysAgo() } },
      select: { buyerPhone: true, buyerEmail: true, buyerName: true },
      take: 5000,
    });
    return orders.map((o) => ({
      phone: o.buyerPhone,
      email: o.buyerEmail,
      name: o.buyerName?.split(" ")[0] ?? "there",
    }));
  }

  const where =
    audience === "agents.active"
      ? { status: "active" }
      : audience === "agents.owed"
        ? { balance: { gt: 0 } }
        : {};
  const agents = await dataDb.dataAgent.findMany({
    where,
    select: { userId: true, storeName: true, supportPhone: true },
    take: 5000,
  });

  // The people behind the agents live in the retail database, so this is a
  // second query rather than a join Postgres cannot do across two of them.
  const users = await prisma.user.findMany({
    where: { id: { in: agents.map((a) => a.userId) } },
    select: { id: true, name: true, phone: true, email: true, passwordHash: true },
  });
  const byId = new Map(users.map((u) => [u.id, u]));

  return agents
    .filter((a) => {
      if (audience !== "agents.dormant") return true;
      // Never signed in: the account still has no password of its own.
      return !byId.get(a.userId)?.passwordHash;
    })
    .map((a) => {
      const user = byId.get(a.userId);
      return {
        phone: a.supportPhone || user?.phone || null,
        email: user?.email ?? null,
        name: user?.name?.split(" ")[0] ?? a.storeName,
      };
    });
}

async function retailAudience(audience: string): Promise<BroadcastRecipient[]> {
  if (audience === "vendors.all") {
    const vendors = await prisma.vendor.findMany({
      where: { ownerId: { not: null } },
      select: { businessName: true, owner: { select: { name: true, phone: true, email: true } } },
      take: 5000,
    });
    return vendors.map((v) => ({
      phone: v.owner?.phone ?? null,
      email: v.owner?.email ?? null,
      name: v.owner?.name?.split(" ")[0] ?? v.businessName,
    }));
  }

  if (audience === "affiliates.all") {
    const affiliates = await prisma.affiliate.findMany({
      select: { name: true, phone: true, email: true },
      take: 5000,
    });
    return affiliates.map((a) => ({
      phone: a.phone || null,
      email: a.email || null,
      name: a.name.split(" ")[0] ?? "there",
    }));
  }

  if (audience === "customers.recent") {
    const orders = await prisma.order.findMany({
      where: { createdAt: { gte: ninetyDaysAgo() } },
      select: { user: { select: { name: true, phone: true, email: true } } },
      take: 5000,
    });
    return orders.map((o) => ({
      phone: o.user.phone,
      email: o.user.email,
      name: o.user.name?.split(" ")[0] ?? "there",
    }));
  }

  const users = await prisma.user.findMany({
    where: { role: "CUSTOMER" },
    select: { name: true, phone: true, email: true },
    take: 5000,
  });
  return users.map((u) => ({
    phone: u.phone,
    email: u.email,
    name: u.name?.split(" ")[0] ?? "there",
  }));
}

export interface BroadcastCost {
  people: number;
  withPhone: number;
  withEmail: number;
  /** SMS parts per recipient, which is what the network bills. */
  segments: number;
  unicode: boolean;
  /** Total parts across everybody who will get a text. */
  totalSegments: number;
}

/** What a broadcast will reach and what it will cost, before it is sent. */
export async function estimateBroadcast(
  scope: MessageScope,
  audience: string,
  body: string,
): Promise<BroadcastCost> {
  const people = await resolveAudience(scope, audience);
  const withPhone = people.filter((p) => p.phone).length;
  const { segments, unicode } = smsSegments(body || " ");
  return {
    people: people.length,
    withPhone,
    withEmail: people.filter((p) => p.email).length,
    segments,
    unicode,
    totalSegments: segments * withPhone,
  };
}

export interface SendBroadcastResult {
  recipients: number;
  delivered: number;
  failed: number;
}

/**
 * Send it.
 *
 * In small batches rather than all at once: a few thousand simultaneous calls
 * to one gateway is how a provider starts refusing them, and a broadcast half
 * refused is worse than one that takes a minute.
 */
export async function sendBroadcast(input: {
  scope: MessageScope;
  audience: string;
  channel: "sms" | "email" | "both";
  subject: string;
  body: string;
}): Promise<SendBroadcastResult> {
  const people = await resolveAudience(input.scope, input.audience);
  let delivered = 0;
  let failed = 0;

  const BATCH = 20;
  for (let i = 0; i < people.length; i += BATCH) {
    const batch = people.slice(i, i + BATCH);
    const results = await Promise.allSettled(
      batch.map(async (person) => {
        const text = renderMessage(input.body, { name: person.name });
        const tasks: Promise<boolean>[] = [];
        if (person.phone && input.channel !== "email") tasks.push(sendSms(person.phone, text));
        if (person.email && input.channel !== "sms") {
          tasks.push(
            sendEmail(
              person.email,
              renderMessage(input.subject || "Nickimart", { name: person.name }),
              emailShell(paragraphs(text), input.subject || "Nickimart"),
            ),
          );
        }
        if (tasks.length === 0) return false;
        const outcomes = await Promise.all(tasks);
        return outcomes.some(Boolean);
      }),
    );
    for (const r of results) {
      if (r.status === "fulfilled" && r.value) delivered += 1;
      else failed += 1;
    }
  }

  return { recipients: people.length, delivered, failed };
}

/** Record it. A broadcast that nobody can point at afterwards is a rumour. */
export async function recordBroadcast(
  scope: MessageScope,
  row: {
    audience: string;
    channel: string;
    subject: string;
    body: string;
    recipients: number;
    delivered: number;
    failed: number;
    sentBy: string;
  },
): Promise<void> {
  try {
    if (scope === "retail") await prisma.broadcast.create({ data: row });
    else await dataDb.dataBroadcast.create({ data: row });
  } catch {
    // The messages went out; failing to log them must not report a failure.
  }
}

export async function listBroadcasts(scope: MessageScope, take = 50) {
  try {
    return scope === "retail"
      ? await prisma.broadcast.findMany({ orderBy: { createdAt: "desc" }, take })
      : await dataDb.dataBroadcast.findMany({ orderBy: { createdAt: "desc" }, take });
  } catch {
    return [];
  }
}

export function audienceLabel(scope: MessageScope, value: string): string {
  return broadcastAudiences(scope).find((a) => a.value === value)?.label ?? value;
}
