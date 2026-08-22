"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/session";
import { isNetwork, type Network } from "@/lib/data-bundles/networks";
import { dispatchDataOrder, refreshDataOrder, dispatchAfaRegistration } from "@/lib/data-bundles/fulfillment";
import { runDataBundleSweep } from "@/lib/data-bundles/monitor";

/**
 * Admin console actions for the data bundle storefront. Every one of these
 * guards with `requireAdmin()` — they set retail prices and spend the agent
 * wallet, so a stale session must never reach them.
 */

export type DataAdminState = { ok?: boolean; error?: string; message?: string };

const STORAGE_ERROR =
  "Couldn't save — the data bundle tables aren't set up on this database yet. " +
  "Run the Neon catch-up SQL (nikimart-neon-data-bundles.sql), then try again.";

function str(fd: FormData, key: string): string {
  return String(fd.get(key) ?? "").trim();
}

function num(fd: FormData, key: string): number | null {
  const v = str(fd, key);
  if (!v) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function revalidateAll() {
  revalidatePath("/data-bundles");
  revalidatePath("/admin/data");
  revalidatePath("/admin/data/bundles");
  revalidatePath("/admin/data/orders");
}

// ---------------------------------------------------------------------------
// Bundle prices
// ---------------------------------------------------------------------------

/**
 * Save every edited row of the price table in one go. Fields arrive as
 * `price:<id>`, `cost:<id>` and `active:<id>` so one submit covers a whole
 * network without a round-trip per row.
 */
export async function saveBundlePrices(
  _prev: DataAdminState,
  fd: FormData,
): Promise<DataAdminState> {
  await requireAdmin();

  const ids = fd.getAll("bundleId").map(String).filter(Boolean);
  if (ids.length === 0) return { error: "Nothing to save." };

  const updates: Array<{ id: string; price: number; costPrice: number; isActive: boolean }> = [];
  for (const id of ids) {
    const price = num(fd, `price:${id}`);
    const cost = num(fd, `cost:${id}`);
    if (price === null || price < 0) {
      return { error: "Every selling price must be a number of 0 or more." };
    }
    if (cost !== null && cost < 0) {
      return { error: "Cost prices can't be negative." };
    }
    updates.push({
      id,
      price: Math.round(price * 100) / 100,
      costPrice: Math.round((cost ?? 0) * 100) / 100,
      isActive: fd.get(`active:${id}`) === "on",
    });
  }

  try {
    await prisma.$transaction(
      updates.map((u) =>
        prisma.dataBundle.update({
          where: { id: u.id },
          data: { price: u.price, costPrice: u.costPrice, isActive: u.isActive },
        }),
      ),
    );
  } catch {
    return { error: STORAGE_ERROR };
  }

  revalidateAll();
  return { ok: true, message: `Saved ${updates.length} ${updates.length === 1 ? "price" : "prices"}.` };
}

/** Add a size that isn't in the ladder yet. */
export async function createBundle(
  _prev: DataAdminState,
  fd: FormData,
): Promise<DataAdminState> {
  await requireAdmin();

  const network = str(fd, "network");
  if (!isNetwork(network)) return { error: "Choose a network." };

  const sizeGb = num(fd, "sizeGb");
  if (sizeGb === null || sizeGb <= 0) return { error: "Enter the bundle size in GB." };

  const price = num(fd, "price");
  if (price === null || price <= 0) return { error: "Enter the selling price." };

  const cost = num(fd, "costPrice") ?? 0;

  try {
    await prisma.dataBundle.create({
      data: {
        network,
        sizeGb,
        price: Math.round(price * 100) / 100,
        costPrice: Math.round(Math.max(cost, 0) * 100) / 100,
        validity: str(fd, "validity") || "No expiry",
        isActive: true,
        order: 0,
      },
    });
  } catch {
    // The unique (network, sizeGb) index is the likeliest cause — say so rather
    // than blaming the migration.
    const clash = await prisma.dataBundle
      .findUnique({ where: { network_sizeGb: { network, sizeGb } } })
      .catch(() => null);
    return {
      error: clash
        ? `${sizeGb}GB already exists on that network — edit the existing row instead.`
        : STORAGE_ERROR,
    };
  }

  revalidateAll();
  return { ok: true, message: `Added ${sizeGb}GB.` };
}

export async function deleteBundle(fd: FormData): Promise<void> {
  await requireAdmin();
  const id = str(fd, "id");
  if (!id) return;
  try {
    await prisma.dataBundle.delete({ where: { id } });
    revalidateAll();
  } catch {
    // Already gone, or the table isn't there — nothing to undo.
  }
}

/**
 * Re-price a whole network from its cost prices: price = cost × (1 + markup%),
 * rounded up to the next whole Cedi. Rows with no cost recorded are left alone
 * rather than being zeroed.
 */
export async function applyMarkup(_prev: DataAdminState, fd: FormData): Promise<DataAdminState> {
  await requireAdmin();

  const network = str(fd, "network");
  if (!isNetwork(network)) return { error: "Choose a network." };

  const markup = num(fd, "markupPercent");
  if (markup === null || markup < 0 || markup > 500) {
    return { error: "Enter a markup between 0 and 500 percent." };
  }

  try {
    const rows = await prisma.dataBundle.findMany({ where: { network: network as Network } });
    const priced = rows.filter((r) => r.costPrice > 0);
    if (priced.length === 0) {
      return { error: "No cost prices recorded for that network yet, so there's nothing to mark up." };
    }
    await prisma.$transaction(
      priced.map((r) =>
        prisma.dataBundle.update({
          where: { id: r.id },
          data: { price: Math.ceil(r.costPrice * (1 + markup / 100)) },
        }),
      ),
    );
    revalidateAll();
    return { ok: true, message: `Re-priced ${priced.length} bundles at +${markup}%.` };
  } catch {
    return { error: STORAGE_ERROR };
  }
}

// ---------------------------------------------------------------------------
// Orders
// ---------------------------------------------------------------------------

/** Send a paid order to the provider again after a failed dispatch. */
export async function retryDataOrder(fd: FormData): Promise<void> {
  await requireAdmin();
  const id = str(fd, "id");
  if (id) await dispatchDataOrder(id);
  revalidatePath("/admin/data/orders");
}

/** Ask the provider for an order's current status and apply it. */
export async function refreshDataOrderStatus(fd: FormData): Promise<void> {
  await requireAdmin();
  const id = str(fd, "id");
  if (id) await refreshDataOrder(id);
  revalidatePath("/admin/data/orders");
}

/**
 * Record that a failed order has been refunded. This is a bookkeeping flag —
 * the money moves in Paystack, not here — so it's only allowed on an order that
 * actually failed, never as a way to close a delivered one.
 */
export async function markDataOrderRefunded(fd: FormData): Promise<void> {
  await requireAdmin();
  const id = str(fd, "id");
  if (!id) return;
  await prisma.dataOrder
    .updateMany({ where: { id, status: "failed" }, data: { status: "refunded" } })
    .catch(() => {});
  revalidatePath("/admin/data/orders");
}

export async function retryAfaRegistration(fd: FormData): Promise<void> {
  await requireAdmin();
  const id = str(fd, "id");
  if (id) await dispatchAfaRegistration(id);
  revalidatePath("/admin/data/afa");
}

/**
 * Run the safety-net sweep on demand — the same work the daily cron does.
 * Useful right after topping up the wallet, when you'd rather not wait until
 * tomorrow for stalled orders to be re-driven.
 */
export async function sweepDataOrders(): Promise<void> {
  await requireAdmin();
  await runDataBundleSweep();
  revalidatePath("/admin/data");
  revalidatePath("/admin/data/orders");
}
