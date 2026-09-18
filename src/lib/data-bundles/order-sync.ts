import "server-only";
import { dataDb } from "@/lib/data-db";
import { isDataProviderConfigured } from "@/lib/data-bundles/provider";
import { refreshDataOrder } from "@/lib/data-bundles/fulfillment";

/**
 * Keeping an order's status in step with the provider.
 *
 * The provider takes a callback URL and is trusted to use it, which it does —
 * sometimes. An order accepted and then worked on upstream can change status
 * two or three times before it lands, and nothing tells us about the ones in
 * between. Until this existed the only things that noticed were an admin
 * pressing refresh on one order and the nightly sweep, so a bundle the
 * provider had been processing for an hour still read "queued" here.
 *
 * So the status is re-read whenever somebody is actually looking at it. That
 * is the moment it matters and the moment we are already doing work, and it
 * costs one provider call per open order rather than a poll per order forever.
 *
 * Three things keep it cheap:
 *
 *   • Only open orders. A completed, failed or refunded order is finished, and
 *     `applyProviderStatus` will not walk a terminal state backwards anyway.
 *   • Only ones nobody has looked at recently. Every refresh writes the row, so
 *     `updatedAt` is also "when we last asked" — free, and exactly right.
 *   • A handful at a time, and never for longer than the page can afford. The
 *     calls that do not finish in time are not cancelled; they simply land
 *     after the render, and the page picks them up on its next poll.
 */

/** Don't ask the provider about the same order more often than this. */
const STALE_AFTER_MS = 20_000;
/** Provider calls per view. Enough for a screenful, small enough to be quick. */
const MAX_PER_VIEW = 8;
/** How long a page will wait for them before rendering what it has. */
const BUDGET_MS = 2_500;

export interface SyncOpenOrdersOptions {
  /** Narrow to one agent's orders — what their own console should refresh. */
  agentId?: string;
  limit?: number;
  /** References on the screen right now; refreshed ahead of anything else. */
  references?: string[];
}

export async function syncOpenOrders(opts: SyncOpenOrdersOptions = {}): Promise<number> {
  if (!isDataProviderConfigured()) return 0;

  const cutoff = new Date(Date.now() - STALE_AFTER_MS);
  let open: { id: string }[];
  try {
    open = await dataDb.dataOrder.findMany({
      where: {
        status: { in: ["queued", "processing"] },
        providerOrderId: { not: null },
        updatedAt: { lt: cutoff },
        ...(opts.agentId ? { agentId: opts.agentId } : {}),
        ...(opts.references?.length ? { reference: { in: opts.references } } : {}),
      },
      // Oldest first: the one nobody has checked for longest is the one most
      // likely to have moved.
      orderBy: { updatedAt: "asc" },
      take: Math.min(opts.limit ?? MAX_PER_VIEW, MAX_PER_VIEW),
      select: { id: true },
    });
  } catch {
    // Tables not migrated, or the database is briefly unreachable. Showing the
    // last known status is the right failure here.
    return 0;
  }
  if (open.length === 0) return 0;

  let refreshed = 0;
  const work = Promise.allSettled(
    open.map(async (order) => {
      const result = await refreshDataOrder(order.id);
      if (result.ok) refreshed += 1;
    }),
  );

  // Whatever is done by the deadline is in the page; the rest still completes
  // and still writes, it just shows a moment later.
  await Promise.race([work, new Promise((resolve) => setTimeout(resolve, BUDGET_MS))]);
  return refreshed;
}
