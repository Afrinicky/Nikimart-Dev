import "server-only";
import { dataDb } from "@/lib/data-db";
import { round2 } from "@/lib/data-bundles/agent-pricing";
import { getProviderBalance } from "@/lib/data-bundles/provider";

/**
 * Accounting for the wallet the bundles are actually bought from.
 *
 * The provider gives us a balance and nothing else — no statement, no ledger —
 * so two real movements of money were invisible on this side: the cash put
 * into that wallet, and the cash taken out of it by an order placed on the
 * provider's own platform rather than through Nickimart. The first is the
 * answer to "how much am I really putting in"; the second is spending nobody
 * here could see.
 *
 * Both are recoverable from the balance alone, as long as the balance is read
 * often enough and what we spent in between is known. Between two readings:
 *
 *     change    = balance now − balance then
 *     ourCost   = what Nickimart's own dispatches cost in that interval
 *     residual  = change + ourCost
 *
 * A positive residual is money somebody added; a negative one is money that
 * left for an order we did not place. One of the two is always zero.
 *
 * Two things this cannot do, and says so rather than pretending:
 *
 *   • The resolution is the sweep's. A top-up and a direct order inside the
 *     same interval net off against each other and the smaller of the two is
 *     never seen. Reading a balance is not reading a statement.
 *   • AFA registrations are dispatched against the same wallet but carry no
 *     cost price anywhere in the schema, so they are counted at nothing. An
 *     interval holding one understates `ourCost` by the provider's AFA fee,
 *     which shows up as a small unexplained debit.
 */

/**
 * How far the arithmetic may be out before a movement is called a movement.
 *
 * Our recorded cost is the price the ladder had when the order was placed, not
 * a receipt from the provider, so a few pesewas of disagreement across an
 * interval is normal and is not news. Anything above this is.
 */
const TOLERANCE = 0.5;

export interface ProviderBalanceReading {
  id: string;
  balance: number;
  previousBalance: number | null;
  change: number;
  ourCost: number;
  credited: number;
  debited: number;
  source: string;
  createdAt: Date;
}

/** What Nickimart's own dispatches took out of the provider wallet. */
async function ourCostBetween(from: Date | null, to: Date): Promise<number> {
  if (!from) return 0;
  try {
    const orders = await dataDb.dataOrder.aggregate({
      where: {
        // Accepted upstream, which is when the provider charged for it. A
        // dispatch that failed was never charged.
        providerOrderId: { not: null },
        status: { not: "failed" },
        dispatchedAt: { gte: from, lt: to },
      },
      _sum: { costPrice: true },
    });
    return round2(orders._sum.costPrice ?? 0);
  } catch {
    return 0;
  }
}

/**
 * Take a reading and write down what moved since the last one.
 *
 * Called from the sweep — which already reads the balance for its low-wallet
 * alert, so this costs nothing extra — and from the admin's own button on the
 * top-ups tab. A balance that cannot be read writes nothing: a gap in the
 * readings is honest, and a zero in place of a balance would be invented
 * spending of the whole float.
 */
export async function recordProviderBalance(
  balance: number | null,
  source: "sweep" | "manual" = "sweep",
): Promise<ProviderBalanceReading | null> {
  if (balance === null || !Number.isFinite(balance)) return null;

  const now = new Date();
  const value = round2(balance);

  try {
    const last = await dataDb.dataProviderBalance.findFirst({
      orderBy: { createdAt: "desc" },
      select: { balance: true, createdAt: true },
    });

    const previousBalance = last ? round2(last.balance) : null;
    const change = previousBalance === null ? 0 : round2(value - previousBalance);
    const ourCost = await ourCostBetween(last?.createdAt ?? null, now);
    const residual = round2(change + ourCost);

    const row = await dataDb.dataProviderBalance.create({
      data: {
        balance: value,
        previousBalance,
        change,
        ourCost,
        credited: residual > TOLERANCE ? residual : 0,
        debited: residual < -TOLERANCE ? round2(-residual) : 0,
        // The first reading has nothing to compare against, and saying so
        // keeps it from being read as a day on which nothing happened.
        source: previousBalance === null ? "initial" : source,
      },
    });
    return row;
  } catch {
    // Table not migrated yet. The balance is still read and alerted on
    // elsewhere; only the bookkeeping is skipped.
    return null;
  }
}

/** Read the live balance and record it. The admin's button on the tab. */
export async function captureProviderBalance(): Promise<{ ok: boolean; message: string }> {
  const { balance, message } = await getProviderBalance();
  if (balance === null) return { ok: false, message };
  const row = await recordProviderBalance(balance, "manual");
  return row
    ? { ok: true, message: "Provider wallet reading recorded." }
    : { ok: false, message: "Couldn't save the reading — is the database migrated?" };
}

/** The current provider wallet balance as last written down, without a call. */
export async function lastProviderReading(): Promise<ProviderBalanceReading | null> {
  try {
    return await dataDb.dataProviderBalance.findFirst({ orderBy: { createdAt: "desc" } });
  } catch {
    return null;
  }
}
