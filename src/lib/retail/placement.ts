import "server-only";
import { getPurchaseQueue, getPurchaseOrders, type QueueGroup, type PurchaseRecord } from "@/lib/purchasing";

/**
 * The order-placement tab: the queue, filtered, paged, and addressable.
 *
 * A queue row is not a database row — it is one supplier, on one lane, for one
 * seller, worked out from the lines waiting. That makes its identity a
 * composite string, which is fine to hold in memory and no good at all in a
 * URL. So a row is addressed by a token: the key, base64url'd, which is what
 * the detail window is opened with and what a "place these together" form
 * posts back.
 *
 * Grouping by supplier matters twice over. The queue groups by supplier *and*
 * lane, because that is the parcel the forwarder will carry. But an admin
 * buying from one supplier buys everything from them in one sitting, whatever
 * lane it travels on — so `siblingsOf` finds the other rows that share a
 * supplier, and those are the ones that can be placed together.
 */

export type { QueueGroup, PurchaseRecord };

export function groupToken(key: string): string {
  return Buffer.from(key, "utf8").toString("base64url");
}

export function keyFromToken(token: string): string {
  try {
    return Buffer.from(token, "base64url").toString("utf8");
  } catch {
    return "";
  }
}

/** How a supplier is identified across lanes: their link, else their name. */
export function supplierKey(g: QueueGroup): string {
  return (g.supplierUrl || g.supplierName).trim().toLowerCase();
}

export const QUEUE_STATUS_OPTIONS = [
  { value: "all", label: "All suppliers" },
  { value: "ready", label: "Ready to order" },
  { value: "waiting", label: "Building volume" },
  { value: "due", label: "Due — scheduled date" },
] as const;

export const QUEUE_SORT_OPTIONS = [
  { value: "ready", label: "Readiness" },
  { value: "waiting", label: "Longest waiting" },
  { value: "value", label: "Goods value" },
  { value: "volume", label: "Volume" },
] as const;

export function queueStatusFilter(raw: string | undefined): string {
  const value = (raw ?? "").trim();
  return QUEUE_STATUS_OPTIONS.some((o) => o.value === value) ? value : "all";
}

export function queueSort(raw: string | undefined): string {
  const value = (raw ?? "").trim();
  return QUEUE_SORT_OPTIONS.some((o) => o.value === value) ? value : "ready";
}

export interface QueueView {
  groups: QueueGroup[];
  total: number;
  /** Every group in the queue, for the stats strip and the sibling lookup. */
  all: QueueGroup[];
}

export async function getQueueView({
  status = "all",
  sort = "ready",
  query = "",
  page = 1,
  perPage = 25,
}: {
  status?: string;
  sort?: string;
  query?: string;
  page?: number;
  perPage?: number;
} = {}): Promise<QueueView> {
  const all = await getPurchaseQueue();
  const term = query.trim().toLowerCase();

  let rows = all;
  if (status === "ready") rows = rows.filter((g) => g.thresholdMet || g.scheduleDue);
  if (status === "waiting") rows = rows.filter((g) => !g.thresholdMet && !g.scheduleDue);
  if (status === "due") rows = rows.filter((g) => g.scheduleDue);
  if (term) {
    rows = rows.filter((g) =>
      [g.supplierName, g.vendorName, g.forwarderName, g.routeLabel, g.destinationName]
        .join(" ")
        .toLowerCase()
        .includes(term) ||
      g.lines.some((l) => `${l.productName} ${l.orderNumber} ${l.buyerName}`.toLowerCase().includes(term)),
    );
  }

  const sorted = [...rows];
  if (sort === "waiting") sorted.sort((a, b) => a.waitingSince.getTime() - b.waitingSince.getTime());
  if (sort === "value") sorted.sort((a, b) => b.goodsValue - a.goodsValue);
  if (sort === "volume") sorted.sort((a, b) => b.totalCbm - a.totalCbm);

  const start = (Math.max(1, page) - 1) * perPage;
  return { groups: sorted.slice(start, start + perPage), total: sorted.length, all };
}

/** The four parts a queue key is built from. */
export function partsFromKey(key: string): {
  vendorId: string;
  supplier: string;
  forwarderId: string;
  routeId: string;
} | null {
  const bits = key.split("::");
  if (bits.length !== 4) return null;
  return { vendorId: bits[0], supplier: bits[1], forwarderId: bits[2], routeId: bits[3] };
}

/**
 * One queue row by its token — and, when it is no longer in the queue, what
 * happened to it.
 *
 * The second half is not a nicety. Placing a purchase is the one action that
 * removes the row the admin is looking at, and Next re-renders the page it
 * was taken from as part of the same response. A window that only knew how to
 * show a queue row answered its own success with "Page not found": the
 * purchase went through, and the screen said the opposite.
 *
 * So a token that no longer names a waiting parcel resolves to the purchases
 * that now cover it, matched on the same supplier, shop and lane the key was
 * built from.
 */
export async function getQueueGroup(token: string): Promise<{
  group: QueueGroup | null;
  siblings: QueueGroup[];
  /** Purchases covering this key, newest first. Only read when the row is gone. */
  placed: PurchaseRecord[];
}> {
  const key = keyFromToken(token);
  if (!key) return { group: null, siblings: [], placed: [] };

  const all = await getPurchaseQueue();
  const group = all.find((g) => g.key === key) ?? null;
  if (group) {
    const mine = supplierKey(group);
    return {
      group,
      siblings: all.filter((g) => g.key !== group.key && supplierKey(g) === mine),
      placed: [],
    };
  }

  return { group: null, siblings: [], placed: await purchasesForKey(key) };
}

/**
 * The purchases that cover a queue key, newest first.
 *
 * Matched on the supplier the key was built from rather than on the key
 * itself, which is never stored. A purchase bought across two lanes carries
 * no route of its own, so the lane is deliberately not part of the match:
 * what the admin needs to see is "this supplier's parcel was bought, here is
 * the reference", and narrowing further would hide the very purchase they
 * just made.
 */
async function purchasesForKey(key: string): Promise<PurchaseRecord[]> {
  const parts = partsFromKey(key);
  if (!parts) return [];
  const wanted = parts.supplier.trim().toLowerCase();
  const rows = await getPurchaseOrders();
  return rows.filter(
    (p) => (p.supplierUrl || p.supplierName).trim().toLowerCase() === wanted,
  );
}

export const PLACED_STATUS_OPTIONS = [
  { value: "all", label: "All purchases" },
  { value: "placed", label: "Ordered from supplier" },
  { value: "received", label: "Received by forwarder" },
  { value: "cancelled", label: "Cancelled" },
] as const;

export function placedStatusFilter(raw: string | undefined): string {
  const value = (raw ?? "").trim();
  return PLACED_STATUS_OPTIONS.some((o) => o.value === value) ? value : "all";
}

/** Purchases already placed, filtered and paged like the queue above it. */
export async function getPlacedView({
  status = "all",
  query = "",
  page = 1,
  perPage = 25,
}: {
  status?: string;
  query?: string;
  page?: number;
  perPage?: number;
} = {}): Promise<{ purchases: PurchaseRecord[]; total: number; all: PurchaseRecord[] }> {
  const all = await getPurchaseOrders();
  const term = query.trim().toLowerCase();

  let rows = all;
  if (status !== "all") rows = rows.filter((p) => p.status === status);
  if (term) {
    rows = rows.filter((p) =>
      [p.reference, p.supplierName, p.vendorName, p.forwarderName, p.routeLabel, p.note]
        .join(" ")
        .toLowerCase()
        .includes(term),
    );
  }

  const start = (Math.max(1, page) - 1) * perPage;
  return { purchases: rows.slice(start, start + perPage), total: rows.length, all };
}
