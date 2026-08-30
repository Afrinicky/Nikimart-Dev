import "server-only";
import { prisma } from "@/lib/prisma";
import { notify, type Recipient } from "@/lib/notifications";
import { formatPrice } from "@/lib/format";
import { getDataStoreConfig, getStaffNotifyChannel } from "@/lib/settings";
import { getProviderBalance, isDataProviderConfigured } from "@/lib/data-bundles/provider";
import { dispatchAfaRegistration, dispatchDataOrder, refreshDataOrder } from "@/lib/data-bundles/fulfillment";
import { sweepAgentCommissions } from "@/lib/data-bundles/agent-ledger";
import { bundleLabel, networkLabel } from "@/lib/data-bundles/networks";

/**
 * Unattended safety net for the bundle store.
 *
 * Two things can take money from a customer and quietly give them nothing, and
 * neither announces itself:
 *
 *   1. The agent wallet runs dry. Every order then fails *after* payment, and
 *      the first you'd hear of it is an angry customer.
 *   2. An order is paid but never reaches the provider — the dispatch failed,
 *      or the provider accepted it and the status callback never arrived.
 *
 * This sweeps for both: it warns while the wallet can still be topped up, and
 * it re-drives orders that stalled. Everything it calls is already idempotent,
 * so a sweep can run as often as you like and can never double-buy a bundle.
 */

/** Don't let one sweep hammer the provider — plenty for a small storefront. */
const MAX_PER_SWEEP = 20;
/** Give the normal path a chance to finish before treating an order as stuck. */
const STUCK_AFTER_MS = 5 * 60_000;

export interface SweepResult {
  balance: number | null;
  lowBalance: boolean;
  alerted: boolean;
  dispatched: number;
  refreshed: number;
  afaDispatched: number;
  /** Delivered agent orders whose commission had never been credited. */
  commissionsCredited: number;
  notes: string[];
}

async function adminRecipients(): Promise<Recipient[]> {
  try {
    return await prisma.user.findMany({
      where: { role: "ADMIN" },
      select: { name: true, phone: true, email: true },
    });
  } catch {
    return [];
  }
}

async function alertAdmins(sms: string, subject: string): Promise<boolean> {
  const [admins, channel] = await Promise.all([adminRecipients(), getStaffNotifyChannel()]);
  if (admins.length === 0) return false;
  await Promise.allSettled(admins.map((a) => notify(a, { sms, emailSubject: subject }, channel)));
  return true;
}

export async function runDataBundleSweep(): Promise<SweepResult> {
  const result: SweepResult = {
    balance: null,
    lowBalance: false,
    alerted: false,
    dispatched: 0,
    refreshed: 0,
    afaDispatched: 0,
    commissionsCredited: 0,
    notes: [],
  };

  if (!isDataProviderConfigured()) {
    result.notes.push("Provider not configured — nothing to sweep.");
    return result;
  }

  const config = await getDataStoreConfig();
  const cutoff = new Date(Date.now() - STUCK_AFTER_MS);

  // --- 1. Wallet ----------------------------------------------------------
  const balance = await getProviderBalance();
  result.balance = balance.balance;

  if (balance.balance === null) {
    // A wallet we can't read is itself worth knowing about: it usually means
    // the key stopped working, which fails every order from here on.
    result.notes.push(`Could not read the wallet: ${balance.message}`);
    result.alerted = await alertAdmins(
      `Nickimart Data: cannot reach the data provider (${balance.message}). Bundle orders will fail until this is fixed.`,
      "Data provider unreachable",
    );
  } else if (balance.balance < config.lowBalanceThreshold) {
    result.lowBalance = true;
    result.alerted = await alertAdmins(
      `Nickimart Data: agent wallet is down to ${formatPrice(balance.balance)} ` +
        `(alert set at ${formatPrice(config.lowBalanceThreshold)}). Top up on justicedatashop.com ` +
        `before orders start failing.`,
      "Data wallet running low",
    );
  }

  // --- 2. Paid but never handed to the provider ---------------------------
  try {
    const stuck = await prisma.dataOrder.findMany({
      where: {
        paymentStatus: "paid",
        providerOrderId: null,
        status: { in: ["paid", "failed"] },
        createdAt: { lt: cutoff },
      },
      orderBy: { createdAt: "asc" },
      take: MAX_PER_SWEEP,
      select: { id: true, reference: true, sizeGb: true, network: true },
    });

    for (const order of stuck) {
      const sent = await dispatchDataOrder(order.id);
      if (sent.ok) {
        result.dispatched += 1;
      } else {
        result.notes.push(
          `${order.reference} (${bundleLabel(order.sizeGb)} ${networkLabel(order.network)}): ${sent.message}`,
        );
      }
    }
  } catch {
    result.notes.push("Could not read pending orders (tables not migrated?).");
  }

  // --- 3. Accepted upstream but never confirmed ---------------------------
  try {
    const inFlight = await prisma.dataOrder.findMany({
      where: {
        status: "processing",
        providerOrderId: { not: null },
        updatedAt: { lt: cutoff },
      },
      orderBy: { updatedAt: "asc" },
      take: MAX_PER_SWEEP,
      select: { id: true },
    });
    for (const order of inFlight) {
      const refreshed = await refreshDataOrder(order.id);
      if (refreshed.ok) result.refreshed += 1;
    }
  } catch {
    // Already noted above if the tables are missing.
  }

  // --- 4. AFA registrations paid but not submitted ------------------------
  try {
    const afa = await prisma.afaRegistration.findMany({
      where: {
        paymentStatus: "paid",
        providerId: null,
        status: { in: ["paid", "failed"] },
        createdAt: { lt: cutoff },
      },
      take: MAX_PER_SWEEP,
      select: { id: true },
    });
    for (const row of afa) {
      const sent = await dispatchAfaRegistration(row.id);
      if (sent.ok) result.afaDispatched += 1;
    }
  } catch {
    // as above
  }

  // Commission is credited from the delivery callback, which can be missed —
  // a callback that arrived while the ledger was briefly down, or an agent
  // reactivated after their order landed. Catch those up here.
  result.commissionsCredited = await sweepAgentCommissions();

  return result;
}
