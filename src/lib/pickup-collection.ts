import "server-only";
import { createHash, randomInt } from "crypto";
import { prisma } from "@/lib/prisma";
import { notifyTemplate } from "@/lib/messages";
import { getSettings } from "@/lib/settings";

/**
 * Proving that the person at the counter is the person the parcel belongs to.
 *
 * The problem this exists for: collection was a button. An operator who
 * believed whoever was standing in front of them handed over somebody's goods,
 * and nothing anywhere recorded who had taken them. On an order somebody paid
 * for six weeks before it landed, that is the one place the chain of custody
 * had no link at all.
 *
 * Three things fix it, and they are deliberately modest — a counter in a
 * market is not a bank, and a scheme nobody can work is a scheme that gets
 * written on a sticky note:
 *
 *   1. A six-digit code, texted to the buyer when the parcel is ready, stored
 *      here only as a digest. Five wrong tries locks it; an admin reissues.
 *   2. A record of whoever actually took it — name, number, ID — because
 *      sending a brother is normal and banning it would only mean codes
 *      passed around by phone. Witnessed beats forbidden.
 *   3. An override an admin can use when the buyer genuinely cannot produce a
 *      code, which demands a reason in writing and is marked as an override
 *      for as long as the order exists.
 */

/** Long enough that guessing is hopeless, short enough to read down a phone. */
const CODE_DIGITS = 6;
/** Wrong codes before the parcel stops accepting them. */
export const MAX_ATTEMPTS = 5;
/** How long a locked parcel stays locked without an admin. */
const LOCK_MS = 15 * 60 * 1000;

function hashCode(code: string): string {
  return createHash("sha256").update(code.replace(/\D/g, "")).digest("hex");
}

/** "418263" → "418 263", because that is how somebody reads it out. */
export function formatCode(code: string): string {
  return code.length === 6 ? `${code.slice(0, 3)} ${code.slice(3)}` : code;
}

export interface CollectionView {
  orderId: string;
  issued: number;
  codeSentAt: Date | null;
  /** What the operator may be told about a live code: "ends 42". */
  codeHint: string;
  hasLiveCode: boolean;
  attempts: number;
  attemptsLeft: number;
  lockedUntil: Date | null;
  locked: boolean;
  collectedAt: Date | null;
  method: string;
  collectorName: string;
  collectorPhone: string;
  collectorIdType: string;
  collectorIdNumber: string;
  collectorRelation: string;
  overrideReason: string;
  releasedByName: string;
}

type Row = {
  orderId: string;
  codeHash: string;
  codeHint: string;
  codeSentAt: Date | null;
  issued: number;
  attempts: number;
  lockedUntil: Date | null;
  collectedAt: Date | null;
  method: string;
  collectorName: string;
  collectorPhone: string;
  collectorIdType: string;
  collectorIdNumber: string;
  collectorRelation: string;
  overrideReason: string;
  releasedByName: string;
};

export function toView(row: Row): CollectionView {
  const locked = Boolean(row.lockedUntil && row.lockedUntil > new Date());
  return {
    orderId: row.orderId,
    issued: row.issued,
    codeSentAt: row.codeSentAt,
    codeHint: row.codeHint,
    hasLiveCode: Boolean(row.codeHash),
    attempts: row.attempts,
    attemptsLeft: Math.max(0, MAX_ATTEMPTS - row.attempts),
    lockedUntil: row.lockedUntil,
    locked,
    collectedAt: row.collectedAt,
    method: row.method,
    collectorName: row.collectorName,
    collectorPhone: row.collectorPhone,
    collectorIdType: row.collectorIdType,
    collectorIdNumber: row.collectorIdNumber,
    collectorRelation: row.collectorRelation,
    overrideReason: row.overrideReason,
    releasedByName: row.releasedByName,
  };
}

/** The collection record for one order, if it has one. */
export async function getCollection(orderId: string): Promise<CollectionView | null> {
  const row = await prisma.pickupCollection.findUnique({ where: { orderId } }).catch(() => null);
  return row ? toView(row) : null;
}

/** The collection records for a set of orders, keyed by order id. */
export async function getCollections(orderIds: string[]): Promise<Map<string, CollectionView>> {
  if (orderIds.length === 0) return new Map();
  const rows = await prisma.pickupCollection
    .findMany({ where: { orderId: { in: orderIds } } })
    .catch(() => []);
  return new Map(rows.map((r) => [r.orderId, toView(r)]));
}

export interface IssueResult {
  ok: boolean;
  message: string;
}

/**
 * Mint a collection code for an order and text it to the buyer.
 *
 * Called when a parcel is confirmed ready at its point, and again whenever an
 * admin or operator reissues — a buyer who deleted the text, or changed their
 * number, is the ordinary case and must not need a developer.
 *
 * Issuing always replaces: only the newest code works, because two live codes
 * double the guessing surface and buy nothing. Reissuing also clears a lock,
 * which is what makes a lock safe to be strict about.
 *
 * Never throws. A code that could not be sent must not stop the parcel being
 * marked ready; the operator can reissue from the counter with the buyer
 * standing there, which is a better recovery than a failed stage confirmation.
 */
export async function issueCollectionCode(orderId: string): Promise<IssueResult> {
  try {
    const order = await prisma.order.findUnique({
      where: { id: orderId },
      select: {
        id: true,
        orderNumber: true,
        deliveryMethod: true,
        pickupPointId: true,
        pickupPoint: { select: { name: true, locationName: true, openingHours: true } },
        user: { select: { name: true, phone: true, email: true } },
      },
    });
    if (!order) return { ok: false, message: "That order doesn't exist." };
    if (order.deliveryMethod !== "pickup") {
      return { ok: false, message: "That order isn't being collected in person." };
    }

    const existing = await prisma.pickupCollection.findUnique({
      where: { orderId },
      select: { collectedAt: true },
    });
    if (existing?.collectedAt) {
      return { ok: false, message: "That order has already been collected." };
    }

    const code = String(randomInt(0, 10 ** CODE_DIGITS)).padStart(CODE_DIGITS, "0");
    const values = {
      codeHash: hashCode(code),
      // Enough for an operator to confirm the buyer is reading the right text,
      // and far too little to help anybody guess the rest.
      codeHint: code.slice(-2),
      codeSentAt: new Date(),
      attempts: 0,
      lockedUntil: null,
      pickupPointId: order.pickupPointId,
    };
    await prisma.pickupCollection.upsert({
      where: { orderId },
      update: { ...values, issued: { increment: 1 } },
      create: { orderId, ...values, issued: 1 },
    });

    const point = order.pickupPoint
      ? `${order.pickupPoint.name} — ${order.pickupPoint.locationName}`
      : "your pickup point";
    const hours = order.pickupPoint?.openingHours?.trim() || (await businessHours());

    await notifyTemplate(order.user, "order.pickupCode", {
      name: order.user.name?.split(" ")[0] ?? "there",
      orderNumber: order.orderNumber,
      point,
      code: formatCode(code),
      hours: hours ? `Collection hours: ${hours}.` : "",
    });

    return { ok: true, message: `A collection code has been sent to ${maskPhone(order.user.phone)}.` };
  } catch {
    return { ok: false, message: "Couldn't send a collection code just now." };
  }
}

async function businessHours(): Promise<string> {
  try {
    return (await getSettings()).businessHours.trim();
  } catch {
    return "";
  }
}

/** "0241234567" → "024 *** 4567". Enough to recognise, not enough to dial. */
export function maskPhone(phone: string | null | undefined): string {
  const digits = (phone ?? "").replace(/\s+/g, "");
  if (digits.length < 7) return digits || "their phone";
  return `${digits.slice(0, 3)} *** ${digits.slice(-4)}`;
}

export type CheckOutcome = "ok" | "wrong" | "locked" | "spent" | "none";

export interface CheckResult {
  outcome: CheckOutcome;
  attemptsLeft: number;
  message: string;
}

/**
 * Spend a code against what was typed at the counter.
 *
 * A wrong code costs an attempt; the fifth wrong one locks the parcel for a
 * quarter of an hour, which is long enough to make guessing pointless and
 * short enough that an honest mistake does not need an admin. The code is
 * cleared on success, so the same text cannot release a second parcel and a
 * screenshot forwarded afterwards is worth nothing.
 */
export async function checkCollectionCode(orderId: string, typed: string): Promise<CheckResult> {
  const digits = typed.replace(/\D/g, "");
  const row = await prisma.pickupCollection
    .findUnique({
      where: { orderId },
      select: { codeHash: true, attempts: true, lockedUntil: true, collectedAt: true },
    })
    .catch(() => null);

  if (!row || !row.codeHash) {
    return {
      outcome: "none",
      attemptsLeft: MAX_ATTEMPTS,
      message: "No collection code has been sent for this order yet. Send one first.",
    };
  }
  if (row.collectedAt) {
    return { outcome: "spent", attemptsLeft: 0, message: "This order has already been collected." };
  }
  if (row.lockedUntil && row.lockedUntil > new Date()) {
    const mins = Math.max(1, Math.ceil((row.lockedUntil.getTime() - Date.now()) / 60_000));
    return {
      outcome: "locked",
      attemptsLeft: 0,
      message: `Too many wrong codes. Try again in ${mins} minute${mins === 1 ? "" : "s"}, or send a fresh code.`,
    };
  }

  if (digits.length !== CODE_DIGITS || hashCode(digits) !== row.codeHash) {
    const attempts = row.attempts + 1;
    const lock = attempts >= MAX_ATTEMPTS;
    await prisma.pickupCollection
      .update({
        where: { orderId },
        data: { attempts, lockedUntil: lock ? new Date(Date.now() + LOCK_MS) : null },
      })
      .catch(() => undefined);
    const left = Math.max(0, MAX_ATTEMPTS - attempts);
    return {
      outcome: lock ? "locked" : "wrong",
      attemptsLeft: left,
      message: lock
        ? "That's five wrong codes. The parcel is locked for 15 minutes — send a fresh code to unlock it."
        : `That code doesn't match. ${left} ${left === 1 ? "try" : "tries"} left.`,
    };
  }

  return { outcome: "ok", attemptsLeft: MAX_ATTEMPTS, message: "" };
}

export interface HandoverRecord {
  orderId: string;
  pickupPointId: string | null;
  method: "code" | "override";
  collectorName: string;
  collectorPhone: string;
  collectorIdType: string;
  collectorIdNumber: string;
  collectorRelation: string;
  overrideReason: string;
  releasedById: string;
  releasedByName: string;
}

/**
 * Write down who took it, and burn the code.
 *
 * Separate from the check so the order of operations is the safe one: the
 * shipment is only marked collected once this has succeeded, never the other
 * way round. A parcel recorded as handed over with no record of the hand-over
 * is the exact hole this module exists to close.
 */
export async function recordHandover(input: HandoverRecord): Promise<boolean> {
  try {
    const values = {
      codeHash: "",
      codeHint: "",
      attempts: 0,
      lockedUntil: null,
      collectedAt: new Date(),
      method: input.method,
      collectorName: input.collectorName,
      collectorPhone: input.collectorPhone,
      collectorIdType: input.collectorIdType,
      collectorIdNumber: input.collectorIdNumber,
      collectorRelation: input.collectorRelation,
      overrideReason: input.overrideReason,
      releasedById: input.releasedById,
      releasedByName: input.releasedByName,
      pickupPointId: input.pickupPointId,
    };
    await prisma.pickupCollection.upsert({
      where: { orderId: input.orderId },
      update: values,
      create: { orderId: input.orderId, ...values, issued: 0 },
    });
    return true;
  } catch {
    return false;
  }
}
