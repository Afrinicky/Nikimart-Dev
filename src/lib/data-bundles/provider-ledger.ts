import "server-only";
import { dataDb } from "@/lib/data-db";
import { round2 } from "@/lib/data-bundles/agent-pricing";
import { getProviderBalance, isDataProviderConfigured } from "@/lib/data-bundles/provider";

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
 * Our recorded cost is what the provider's own order response said it charged,
 * so a few pesewas of disagreement across an interval is rounding rather than
 * news. Anything above this is.
 */
const TOLERANCE = 0.5;

/**
 * The shortest gap between two readings taken automatically.
 *
 * Every screen that shows the balance reads it, so without this a console
 * left open would write a row a second. Twenty seconds is far denser than the
 * movements being measured and costs one insert; an admin pressing "Record
 * reading" is never throttled, because that press means "now".
 */
const AUTO_MIN_GAP_MS = 20_000;

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

/**
 * What Nickimart's own dispatches took out of the provider wallet.
 *
 * `providerCost` first, and this is the whole accuracy of the thing: it is
 * what the provider's own order response said it charged. `costPrice` is the
 * ladder's figure, which can be blank — a bundle nobody ever typed a cost
 * against reads as zero, and a zero here turns an ordinary sale into an
 * apparent withdrawal from the wallet by somebody else. That is exactly how a
 * GH₵1.67 top-up came to be recorded as GH₵2.43 spent outside Nickimart.
 */
async function ourCostBetween(from: Date | null, to: Date): Promise<number> {
  if (!from) return 0;
  try {
    const rows = await dataDb.$queryRaw<{ total: number | null }[]>`
      SELECT SUM(COALESCE(o."providerCost", o."costPrice"))::float8 AS total
        FROM "DataOrder" o
       WHERE o."providerOrderId" IS NOT NULL
         -- Accepted upstream, which is when the provider charged for it. A
         -- dispatch that failed was never charged.
         AND o.status <> 'failed'
         AND o."dispatchedAt" >= ${from}
         AND o."dispatchedAt" < ${to}
    `;
    return round2(rows[0]?.total ?? 0);
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
  source: "sweep" | "manual" | "auto" = "sweep",
  opts: { readAt?: Date } = {},
): Promise<ProviderBalanceReading | null> {
  if (balance === null || !Number.isFinite(balance)) return null;

  // The moment the provider answered, not the moment this finished writing.
  // The gap is small, but an order dispatched inside it belongs to the next
  // interval rather than this one, and using "now" would charge it to a
  // reading taken before it happened.
  const readAt = opts.readAt ?? new Date();
  const value = round2(balance);

  try {
    const last = await dataDb.dataProviderBalance.findFirst({
      orderBy: { createdAt: "desc" },
      select: { balance: true, createdAt: true },
    });

    // A reading taken because a screen happened to load is worth having, but
    // not thirty times a minute. An admin's own press is never held back.
    if (
      source === "auto" &&
      last &&
      last.createdAt.getTime() > readAt.getTime() - AUTO_MIN_GAP_MS
    ) {
      return null;
    }

    const previousBalance = last ? round2(last.balance) : null;
    const change = previousBalance === null ? 0 : round2(value - previousBalance);
    const ourCost = await ourCostBetween(last?.createdAt ?? null, readAt);
    const residual = round2(change + ourCost);

    const row = await dataDb.dataProviderBalance.create({
      data: {
        balance: value,
        previousBalance,
        change,
        ourCost,
        credited: residual > TOLERANCE ? residual : 0,
        debited: residual < -TOLERANCE ? round2(-residual) : 0,
        createdAt: readAt,
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

/**
 * Read the provider's balance and write the reading down, in one move.
 *
 * This is what every screen that shows the balance should call. The overview
 * was already asking the provider on each load and throwing the answer away,
 * which is why a top-up made at ten past showed up only when somebody pressed
 * a button — and why, with a whole afternoon of selling inside one interval,
 * the top-up came out the far side as a debit. A reading per page view makes
 * each interval minutes long instead of a day, and the arithmetic between two
 * readings that close together has almost nothing left to get wrong.
 */
export async function readAndRecordProviderBalance(): Promise<{
  balance: number | null;
  message: string;
}> {
  if (!isDataProviderConfigured()) return { balance: null, message: "Not configured" };
  const result = await getProviderBalance();
  const readAt = new Date();
  if (result.balance !== null) {
    await recordProviderBalance(result.balance, "auto", { readAt });
  }
  return result;
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

// ---------------------------------------------------------------------------
// Declared movements
// ---------------------------------------------------------------------------

/**
 * A movement on the provider's wallet that no reading could have seen.
 *
 * Everything above this line is inferred from the balance. That works from
 * the first reading onwards and only at the resolution the readings were
 * taken at, which leaves two blind spots: everything that happened before
 * readings began, and anything that netted off against trading inside a
 * single interval. Both are ordinary — a wallet funded for months before this
 * console existed is the common case — and neither can be recovered by taking
 * more readings now.
 *
 * So they are declared instead. A declared entry is an assertion rather than
 * an observation, and it is kept as one: its own table, its own author, and
 * its own line in the reconciliation, so a figure somebody typed is never
 * quietly promoted to a figure the provider stated.
 *
 * And it never moves the balance. The balance is the provider's statement of
 * what the wallet holds, read from the provider and written down unaltered;
 * the moment an administrator can type over it, every reading after that
 * proves nothing and the reconciliation below has no fixed point to work
 * from. A declared entry goes on the history beside the balance, never into
 * it — which is also why one being wrong costs nothing but a deletion.
 */

export const PROVIDER_ENTRY_KINDS = ["FUNDING", "DEBIT"] as const;
export type ProviderEntryKind = (typeof PROVIDER_ENTRY_KINDS)[number];

export interface ProviderEntry {
  id: string;
  kind: string;
  amount: number;
  occurredAt: Date;
  note: string;
  createdByEmail: string;
  createdAt: Date;
}

export interface ProviderEntryInput {
  kind: ProviderEntryKind;
  amount: number;
  occurredAt: Date;
  note?: string;
  byId?: string | null;
  byEmail?: string;
}

/** Record a movement nobody could read off the balance. */
export async function addProviderEntry(
  input: ProviderEntryInput,
): Promise<{ ok: true; entry: ProviderEntry } | { ok: false; error: string }> {
  const amount = round2(input.amount);
  if (!Number.isFinite(amount) || amount <= 0) {
    return { ok: false, error: "Enter an amount greater than zero." };
  }
  if (amount > 1_000_000) {
    return { ok: false, error: "That amount looks wrong. Enter it in cedis, not pesewas." };
  }
  if (Number.isNaN(input.occurredAt.getTime())) {
    return { ok: false, error: "Enter the date the money moved." };
  }
  // A movement dated into the future cannot have happened, and would sit at
  // the top of the list pretending to be the most recent thing that did.
  if (input.occurredAt.getTime() > Date.now() + 60_000) {
    return { ok: false, error: "That date is in the future." };
  }

  try {
    const entry = await dataDb.dataProviderEntry.create({
      data: {
        kind: input.kind,
        amount,
        occurredAt: input.occurredAt,
        note: (input.note ?? "").trim().slice(0, 300),
        createdById: input.byId ?? null,
        createdByEmail: input.byEmail ?? "",
      },
    });
    return { ok: true, entry };
  } catch {
    return {
      ok: false,
      error: "Couldn't save the entry. The declared-movements table may not be migrated yet.",
    };
  }
}

/** Undo a declared entry. Only ever the admin's own typing, never a reading. */
export async function removeProviderEntry(id: string): Promise<boolean> {
  try {
    await dataDb.dataProviderEntry.delete({ where: { id } });
    return true;
  } catch {
    return false;
  }
}

/** What has been declared, newest first. */
export async function listProviderEntries(limit = 50): Promise<ProviderEntry[]> {
  try {
    return await dataDb.dataProviderEntry.findMany({
      orderBy: { occurredAt: "desc" },
      take: limit,
    });
  } catch {
    return [];
  }
}

/** Declared funding and declared spending, as two totals. */
export async function providerEntryTotals(
  since?: Date | null,
): Promise<{ funding: number; debits: number }> {
  try {
    const rows = await dataDb.dataProviderEntry.groupBy({
      by: ["kind"],
      _sum: { amount: true },
      where: since ? { occurredAt: { gte: since } } : undefined,
    });
    let funding = 0;
    let debits = 0;
    for (const row of rows) {
      const value = round2(row._sum.amount ?? 0);
      if (row.kind === "FUNDING") funding = value;
      else if (row.kind === "DEBIT") debits = value;
    }
    return { funding, debits };
  } catch {
    return { funding: 0, debits: 0 };
  }
}
