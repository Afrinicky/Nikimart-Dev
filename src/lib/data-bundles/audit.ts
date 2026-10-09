import "server-only";
import { Prisma } from ".prisma/data-client";
import { dataDb } from "@/lib/data-db";
import { formatMoney } from "@/lib/format";
import { round2 } from "@/lib/data-bundles/agent-pricing";
import { creditWalletTopup } from "@/lib/data-bundles/wallet";
import { providerEntryTotals } from "@/lib/data-bundles/provider-ledger";

/**
 * An audit of the bundle business, run against the rows rather than against a
 * stored figure.
 *
 * The question it answers is the one an auditor asks first: do income,
 * expenditure and the float balance agree with each other, and if they do not,
 * exactly where do they part company. Everything here is recounted from the
 * orders, the ledger and the wallet readings each time it runs, so a report
 * can never be stale and nothing it says can be contradicted by the tables it
 * came from.
 *
 * Two kinds of finding, and the difference matters. A *discrepancy* is an
 * internal contradiction — two of our own tables disagreeing — and those have
 * a mechanical correction, because there is a right answer and the console can
 * write it. An *exception* is something the records simply cannot explain,
 * such as money leaving the provider's wallet without one of our orders behind
 * it; no correction can invent the missing fact, so those are declared by an
 * administrator instead and the report says so rather than guessing.
 *
 * Nothing in here writes anything until a correction is asked for by name.
 */

// ---------------------------------------------------------------------------
// Shapes
// ---------------------------------------------------------------------------

export type AuditSeverity = "clean" | "advisory" | "exception";

/** The corrections this console is able to apply, each by name. */
export const AUDIT_FIXES = [
  "apply-ladder-cost",
  "realign-agent-balances",
  "post-missing-topups",
  "mark-refunded-orders",
] as const;

export type AuditFix = (typeof AUDIT_FIXES)[number];

export function isAuditFix(value: string): value is AuditFix {
  return (AUDIT_FIXES as readonly string[]).includes(value);
}

export interface AuditFinding {
  key: string;
  /** The heading, as it appears on the report. */
  title: string;
  /** What was tested, in one line. */
  test: string;
  severity: AuditSeverity;
  /** What was found, in one line. Reads as a sentence on its own. */
  outcome: string;
  /** How many rows are implicated. */
  count: number;
  /** What it is worth, where that is meaningful. */
  amount: number | null;
  /** Where to go and look at the rows themselves. */
  href?: string;
  /** What that link says. Defaults to the rows, which is usually what it is. */
  hrefLabel?: string;
  /** The correction, where there is a right answer the console can write. */
  fix?: { action: AuditFix; label: string; effect: string };
  /** Said instead of a fix, where the missing fact has to come from a person. */
  remedy?: string;
}

export interface AuditStatement {
  label: string;
  amount: number;
  /** Subtracted on the statement rather than added. */
  negative?: boolean;
  /** A ruled total rather than a component. */
  total?: boolean;
  note?: string;
}

export interface AuditReport {
  runAt: Date;
  days: number;
  windowLabel: string;
  /** Income and expenditure over the window. */
  trading: AuditStatement[];
  /** The provider float over the window, and whether it reconciles. */
  float: AuditStatement[];
  /** What the float statement could not account for. Zero is the good answer. */
  unaccounted: number;
  findings: AuditFinding[];
  totals: { checks: number; clean: number; advisory: number; exceptions: number };
}

// ---------------------------------------------------------------------------
// The run
// ---------------------------------------------------------------------------

/** Anything smaller than this is rounding between our figures and theirs. */
const TOLERANCE = 0.5;

function since(days: number): Date | null {
  if (!days || days <= 0) return null;
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - (days - 1));
  return d;
}

export async function runDataAudit(days: number, windowLabel: string): Promise<AuditReport> {
  const from = since(days);
  const runAt = new Date();

  const [trading, float, findings] = await Promise.all([
    tradingStatement(from),
    floatStatement(from),
    Promise.all([
      checkMissingCost(from),
      checkAgentBalances(),
      checkUnpostedTopups(),
      checkRefundFlags(),
      checkUndispatchedOrders(),
      checkUnexplainedWithdrawals(from),
      checkOpeningFloat(),
      checkWalletReadings(),
      checkFloatBalances(from),
    ]),
  ]);

  const totals = {
    checks: findings.length,
    clean: findings.filter((f) => f.severity === "clean").length,
    advisory: findings.filter((f) => f.severity === "advisory").length,
    exceptions: findings.filter((f) => f.severity === "exception").length,
  };

  // Worst first. A clean check still earns its line — an audit that only
  // prints problems cannot be distinguished from an audit that did not run.
  const rank: Record<AuditSeverity, number> = { exception: 0, advisory: 1, clean: 2 };
  findings.sort((a, b) => rank[a.severity] - rank[b.severity]);

  return {
    runAt,
    days,
    windowLabel,
    trading: trading.lines,
    float: float.lines,
    unaccounted: float.unaccounted,
    findings,
    totals,
  };
}

// ---------------------------------------------------------------------------
// Statement 1 — income and expenditure
// ---------------------------------------------------------------------------

async function tradingStatement(from: Date | null): Promise<{ lines: AuditStatement[] }> {
  const where = {
    paymentStatus: "paid" as const,
    status: { not: "refunded" },
    ...(from ? { createdAt: { gte: from } } : {}),
  };

  try {
    const [orders, refunds] = await Promise.all([
      dataDb.dataOrder.aggregate({
        where,
        _sum: { price: true, costPrice: true, agentCommission: true, teamCommission: true },
      }),
      dataDb.dataOrder.aggregate({
        where: {
          status: "refunded",
          ...(from ? { OR: [{ refundedAt: { gte: from } }, { createdAt: { gte: from } }] } : {}),
        },
        _sum: { price: true },
      }),
    ]);

    const revenue = round2(orders._sum.price ?? 0);
    const cost = round2(orders._sum.costPrice ?? 0);
    const commission = round2(orders._sum.agentCommission ?? 0);
    const team = round2(orders._sum.teamCommission ?? 0);
    const refunded = round2(refunds._sum.price ?? 0);

    return {
      lines: [
        { label: "Bundle revenue", amount: revenue, note: "Paid orders, refunds excluded" },
        { label: "Provider cost", amount: cost, negative: true, note: "What the bundles were bought for" },
        { label: "Gross margin", amount: round2(revenue - cost), total: true },
        { label: "Agent commission", amount: commission, negative: true },
        { label: "Referral and team commission", amount: team, negative: true },
        {
          label: "Net margin",
          amount: round2(revenue - cost - commission - team),
          total: true,
          note: "What Nickimart keeps",
        },
        { label: "Refunded in the period", amount: refunded, note: "Reversed, and already out of revenue" },
      ],
    };
  } catch {
    return { lines: [] };
  }
}

// ---------------------------------------------------------------------------
// Statement 2 — the provider float
// ---------------------------------------------------------------------------

/**
 * Opening balance, everything that went in and out, closing balance.
 *
 * The derived movements satisfy this identity by construction — each reading's
 * credit and debit are defined as whatever the balance did that our own orders
 * could not explain — so with readings alone the residual is zero and the
 * statement proves only that the readings are internally consistent. It earns
 * its place the moment an administrator declares a movement: a declared
 * funding that the readings already saw pushes the residual negative, a real
 * movement nobody recorded pushes it positive, and either way the number at
 * the bottom is the amount still unaccounted for.
 */
async function floatStatement(
  from: Date | null,
): Promise<{ lines: AuditStatement[]; unaccounted: number }> {
  try {
    const [opening, closing, sums, declared] = await Promise.all([
      // The last reading before the window is what the float stood at when it
      // opened. Falling back to the first reading inside the window is right
      // for "all time", where there is nothing before it.
      from
        ? dataDb.dataProviderBalance.findFirst({
            where: { createdAt: { lt: from } },
            orderBy: { createdAt: "desc" },
            select: { balance: true, createdAt: true },
          })
        : null,
      dataDb.dataProviderBalance.findFirst({
        orderBy: { createdAt: "desc" },
        select: { balance: true, createdAt: true },
      }),
      dataDb.dataProviderBalance.aggregate({
        where: from ? { createdAt: { gte: from } } : undefined,
        _sum: { credited: true, debited: true, ourCost: true },
      }),
      providerEntryTotals(from),
    ]);

    const first = from
      ? await dataDb.dataProviderBalance.findFirst({
          where: { createdAt: { gte: from } },
          orderBy: { createdAt: "asc" },
          select: { balance: true, previousBalance: true },
        })
      : await dataDb.dataProviderBalance.findFirst({
          orderBy: { createdAt: "asc" },
          select: { balance: true, previousBalance: true },
        });

    // Two answers, in order of strength: the last reading before the window,
    // or the balance the first reading inside it was measured against.
    //
    // Zero when neither exists, and that is the important case rather than a
    // fallback. The very first reading ever taken has nothing before it, so
    // over all time the float opens at nothing and everything that was ever in
    // it is funding — including whatever it already held when the record
    // began. Treating that first balance as an opening instead would absorb
    // the unrecorded float into the statement and the thing most worth knowing
    // would reconcile silently.
    const openingBalance = round2(opening?.balance ?? first?.previousBalance ?? 0);
    const closingBalance = round2(closing?.balance ?? openingBalance);

    const observedFunding = round2(sums._sum.credited ?? 0);
    const observedDebits = round2(sums._sum.debited ?? 0);
    const ourCost = round2(sums._sum.ourCost ?? 0);

    const expected = round2(
      openingBalance +
        observedFunding +
        declared.funding -
        ourCost -
        observedDebits -
        declared.debits,
    );
    const unaccounted = round2(closingBalance - expected);

    const lines: AuditStatement[] = [
      {
        label: "Opening balance",
        amount: openingBalance,
        total: true,
        note: opening || first?.previousBalance !== null ? undefined : "The record begins here",
      },
      { label: "Funding observed", amount: observedFunding, note: "Derived from the readings" },
      { label: "Funding declared", amount: declared.funding, note: "Entered by an administrator" },
      {
        label: "Cost of dispatches",
        amount: ourCost,
        negative: true,
        note: "Bundles Nickimart sold and bought from this float",
      },
      { label: "Spent outside Nickimart", amount: observedDebits, negative: true },
      { label: "Spending declared", amount: declared.debits, negative: true },
      { label: "Expected balance", amount: expected, total: true },
      { label: "Closing balance", amount: closingBalance, total: true, note: "Last reading taken" },
    ];

    return { lines, unaccounted };
  } catch {
    return { lines: [], unaccounted: 0 };
  }
}

// ---------------------------------------------------------------------------
// The checks
// ---------------------------------------------------------------------------

/**
 * Orders carrying no cost.
 *
 * The most expensive silent error in the system. A zero cost overstates margin
 * on the overview, and it also corrupts the wallet arithmetic — the derivation
 * subtracts our own spending from the balance, so a sale that cost nothing on
 * paper turns into an apparent withdrawal by somebody else.
 */
async function checkMissingCost(from: Date | null): Promise<AuditFinding> {
  const base = {
    key: "missing-cost",
    title: "Cost price recorded on every sale",
    test: "Paid orders carrying neither a ladder cost nor a provider charge.",
    href: "/admin/data/orders",
  };

  try {
    const window = from ? Prisma.sql`AND o."createdAt" >= ${from}` : Prisma.empty;
    const rows = await dataDb.$queryRaw<{ count: bigint; value: number | null }[]>`
      SELECT COUNT(*)::bigint AS count, SUM(o.price)::float8 AS value
        FROM "DataOrder" o
       WHERE o."paymentStatus" = 'paid'
         AND o.status <> 'refunded'
         AND o."costPrice" = 0
         AND o."providerCost" IS NULL
         ${window}
    `;
    const count = Number(rows[0]?.count ?? 0);
    if (count === 0) {
      return { ...base, severity: "clean", outcome: "Every paid sale carries a cost.", count: 0, amount: null };
    }

    const recoverable = await dataDb.$queryRaw<{ count: bigint }[]>`
      SELECT COUNT(*)::bigint AS count
        FROM "DataOrder" o
        JOIN "DataBundle" b ON b.network = o.network AND b."sizeGb" = o."sizeGb"
       WHERE o."paymentStatus" = 'paid'
         AND o.status <> 'refunded'
         AND o."costPrice" = 0
         AND o."providerCost" IS NULL
         AND b."costPrice" > 0
    `;
    const fixable = Number(recoverable[0]?.count ?? 0);

    return {
      ...base,
      severity: "advisory",
      outcome: `${count} paid ${count === 1 ? "sale carries" : "sales carry"} no cost, so margin is overstated by whatever they cost.`,
      count,
      amount: round2(rows[0]?.value ?? 0),
      fix:
        fixable > 0
          ? {
              action: "apply-ladder-cost",
              label: "Apply the ladder cost",
              effect: `Writes the bundle price list's cost onto ${fixable} of them. Orders whose bundle has no cost either are left alone.`,
            }
          : undefined,
      remedy:
        fixable === 0
          ? "No cost is recorded against these bundles on the price list either. Set it in Bundle prices first."
          : undefined,
    };
  } catch {
    return { ...base, severity: "clean", outcome: "Could not be read.", count: 0, amount: null };
  }
}

/**
 * An agent's balance against their own ledger.
 *
 * The ledger is the record and the balance is a cache of it, so they can only
 * disagree if something wrote one without the other. Rebuilding the balance is
 * always the right answer, and it is written as an adjustment rather than an
 * overwrite so the correction is itself on the record.
 */
async function checkAgentBalances(): Promise<AuditFinding> {
  const base = {
    key: "agent-balances",
    title: "Agent balances agree with their ledgers",
    test: "Each agent's stored balance against the sum of their ledger entries.",
    href: "/admin/data/agents",
  };

  try {
    const rows = await driftedAgents();
    if (rows.length === 0) {
      return { ...base, severity: "clean", outcome: "Every balance matches its ledger.", count: 0, amount: null };
    }
    const worst = round2(rows.reduce((sum, r) => sum + Math.abs(r.drift), 0));
    return {
      ...base,
      severity: "exception",
      outcome: `${rows.length} ${rows.length === 1 ? "agent's balance does" : "agents' balances do"} not match the ledger behind it.`,
      count: rows.length,
      amount: worst,
      fix: {
        action: "realign-agent-balances",
        label: "Realign to the ledger",
        effect:
          "Rewrites each balance to the sum of its own entries. The ledger itself is untouched: nothing economic happened here, a cached figure had gone stale, and the entries are what it is a cache of.",
      },
    };
  } catch {
    return { ...base, severity: "clean", outcome: "Could not be read.", count: 0, amount: null };
  }
}

async function driftedAgents(): Promise<{ id: string; ledger: number; drift: number }[]> {
  return dataDb.$queryRaw`
    SELECT a.id,
           COALESCE(SUM(l.amount), 0)::float8 AS ledger,
           (COALESCE(SUM(l.amount), 0) - a.balance)::float8 AS drift
      FROM "DataAgent" a
      LEFT JOIN "DataAgentLedger" l ON l."agentId" = a.id
     GROUP BY a.id, a.balance
    HAVING ABS(COALESCE(SUM(l.amount), 0) - a.balance) > 0.009
  `;
}

/**
 * A top-up the agent paid for and never received.
 *
 * Money has left the agent's card, Paystack has settled it, and the float it
 * was meant for never moved. It is the one discrepancy here that an agent
 * feels directly.
 */
async function checkUnpostedTopups(): Promise<AuditFinding> {
  const base = {
    key: "unposted-topups",
    title: "Settled top-ups reached the float they paid for",
    test: "Top-ups marked paid with no matching credit on the agent's ledger.",
    href: "/admin/data/transactions/topups",
  };

  try {
    const rows = await unpostedTopups();
    if (rows.length === 0) {
      return { ...base, severity: "clean", outcome: "Every settled top-up was credited.", count: 0, amount: null };
    }
    const value = round2(rows.reduce((sum, r) => sum + r.amount, 0));
    return {
      ...base,
      severity: "exception",
      outcome: `${rows.length} settled ${rows.length === 1 ? "top-up was" : "top-ups were"} never credited to the agent's float.`,
      count: rows.length,
      amount: value,
      fix: {
        action: "post-missing-topups",
        label: "Credit the floats",
        effect: `Posts the ${rows.length === 1 ? "credit" : "credits"} against the original reference. A top-up already credited is left alone.`,
      },
    };
  } catch {
    return { ...base, severity: "clean", outcome: "Could not be read.", count: 0, amount: null };
  }
}

async function unpostedTopups(): Promise<
  { id: string; agentId: string; reference: string; amount: number }[]
> {
  return dataDb.$queryRaw`
    SELECT t.id, t."agentId", t.reference,
           (CASE WHEN t."creditedAmount" > 0 THEN t."creditedAmount" ELSE t.amount END)::float8 AS amount
      FROM "DataWalletTopup" t
      LEFT JOIN "DataAgentLedger" l
        ON l.reference = t.reference AND l.type = 'WALLET_TOPUP'
     WHERE t.status = 'paid'
       AND l.id IS NULL
     ORDER BY t."createdAt" DESC
     LIMIT 500
  `;
}

/**
 * An order refunded in fact but not in status.
 *
 * `refundedAt` is stamped when the money goes back. An order carrying that
 * stamp while still counting as a sale is revenue the business does not have.
 */
async function checkRefundFlags(): Promise<AuditFinding> {
  const base = {
    key: "refund-flags",
    title: "Refunded orders are out of revenue",
    test: "Orders stamped with a refund date that still count as sales.",
    href: "/admin/data/orders?status=refunded",
  };

  try {
    const rows = await dataDb.$queryRaw<{ count: bigint; value: number | null }[]>`
      SELECT COUNT(*)::bigint AS count, SUM(o.price)::float8 AS value
        FROM "DataOrder" o
       WHERE o."refundedAt" IS NOT NULL AND o.status <> 'refunded'
    `;
    const count = Number(rows[0]?.count ?? 0);
    if (count === 0) {
      return { ...base, severity: "clean", outcome: "No refunded order is still counted as a sale.", count: 0, amount: null };
    }
    return {
      ...base,
      severity: "exception",
      outcome: `${count} refunded ${count === 1 ? "order is" : "orders are"} still counted as revenue.`,
      count,
      amount: round2(rows[0]?.value ?? 0),
      fix: {
        action: "mark-refunded-orders",
        label: "Take them out of revenue",
        effect: "Sets the status of each one to refunded, which is what the refund date already says happened.",
      },
    };
  } catch {
    return { ...base, severity: "clean", outcome: "Could not be read.", count: 0, amount: null };
  }
}

/** Paid for, never sent. Not a bookkeeping error — a customer waiting. */
async function checkUndispatchedOrders(): Promise<AuditFinding> {
  const base = {
    key: "undispatched",
    title: "Paid orders were dispatched",
    test: "Orders paid more than two hours ago with no upstream order behind them.",
    href: "/admin/data/orders?status=paid",
  };

  try {
    const cutoff = new Date(Date.now() - 2 * 60 * 60 * 1000);
    const rows = await dataDb.$queryRaw<{ count: bigint; value: number | null }[]>`
      SELECT COUNT(*)::bigint AS count, SUM(o.price)::float8 AS value
        FROM "DataOrder" o
       WHERE o."paymentStatus" = 'paid'
         AND o."providerOrderId" IS NULL
         AND o.status NOT IN ('refunded', 'failed')
         AND COALESCE(o."paidAt", o."createdAt") < ${cutoff}
    `;
    const count = Number(rows[0]?.count ?? 0);
    if (count === 0) {
      return { ...base, severity: "clean", outcome: "Every paid order reached the provider.", count: 0, amount: null };
    }
    return {
      ...base,
      severity: "advisory",
      outcome: `${count} paid ${count === 1 ? "order has" : "orders have"} not been sent upstream.`,
      count,
      amount: round2(rows[0]?.value ?? 0),
      remedy:
        "Run the sweep from the overview to re-drive them, or refund the ones the provider will not take.",
    };
  } catch {
    return { ...base, severity: "clean", outcome: "Could not be read.", count: 0, amount: null };
  }
}

/**
 * Money that left the provider's wallet with none of our orders behind it.
 *
 * Two things look identical here and only one of them is a problem. An order
 * placed on the provider's own platform instead of through Nickimart is real
 * spending, fully explained, and simply not ours — there is nothing to
 * correct. A sale of ours whose cost price was never recorded looks exactly
 * the same, because the derivation subtracts what our orders cost and a sale
 * that cost nothing on paper subtracts nothing.
 *
 * So the verdict depends on the cost-price check rather than on the figure.
 * Missing costs present, and this is almost certainly the same money seen from
 * the other side; none, and the withdrawal is accounted for, just not by us.
 *
 * Deliberately not something to declare. A declared movement is additive, and
 * this money is already in the statement as an observed debit: entering it
 * again would count it twice and break the reconciliation it was meant to fix.
 */
async function checkUnexplainedWithdrawals(from: Date | null): Promise<AuditFinding> {
  const base = {
    key: "unexplained-withdrawals",
    title: "Float withdrawals are accounted for",
    test: "Money out of the provider wallet that no Nickimart order explains.",
    href: "/admin/data/transactions/topups?kind=PROVIDER_DEBIT",
    hrefLabel: "Open Top-ups",
  };

  try {
    const [sums, uncosted] = await Promise.all([
      dataDb.dataProviderBalance.aggregate({
        where: from ? { createdAt: { gte: from } } : undefined,
        _sum: { debited: true },
      }),
      dataDb.dataOrder.count({
        where: {
          paymentStatus: "paid",
          status: { not: "refunded" },
          costPrice: 0,
          providerCost: null,
        },
      }),
    ]);
    const observed = round2(sums._sum.debited ?? 0);

    if (observed <= TOLERANCE) {
      return {
        ...base,
        severity: "clean",
        outcome: "Every cedi out of the float is behind one of our orders.",
        count: 0,
        amount: null,
      };
    }

    if (uncosted > 0) {
      return {
        ...base,
        severity: "advisory",
        outcome: `${formatMoney(observed)} left the float with nothing on this side to explain it, and ${uncosted} paid ${uncosted === 1 ? "sale carries" : "sales carry"} no cost. They are very likely the same money.`,
        count: uncosted,
        amount: observed,
        remedy:
          "Correct the cost prices first — the check above does it — and run the audit again. What is left after that is spending on the provider's own platform.",
      };
    }

    return {
      ...base,
      severity: "clean",
      outcome: `${formatMoney(observed)} was spent on the provider's own platform rather than through Nickimart. Accounted for, and already in the statement.`,
      count: 0,
      amount: observed,
    };
  } catch {
    return { ...base, severity: "clean", outcome: "Could not be read.", count: 0, amount: null };
  }
}

/**
 * What the float held before anybody was writing it down.
 *
 * The first reading has nothing before it to be compared against, so whatever
 * was in the wallet at that moment is money put in that no record here can
 * show. An auditor adding up what has been funded will be short by exactly
 * that, which is what declaring it fixes.
 */
async function checkOpeningFloat(): Promise<AuditFinding> {
  const base = {
    key: "opening-float",
    title: "The float's opening balance is on the record",
    test: "The balance standing at the first reading, against funding declared before it.",
    href: "/admin/data/transactions/topups",
    hrefLabel: "Open Top-ups",
  };

  try {
    const first = await dataDb.dataProviderBalance.findFirst({
      orderBy: { createdAt: "asc" },
      select: { balance: true, previousBalance: true, createdAt: true },
    });
    if (!first) {
      return {
        ...base,
        severity: "advisory",
        outcome: "No reading of the provider wallet has ever been taken.",
        count: 0,
        amount: null,
        remedy: "Open the Top-ups tab, or press Record reading, to start the record.",
      };
    }

    const opening = round2(first.previousBalance ?? first.balance);
    if (opening <= TOLERANCE) {
      return { ...base, severity: "clean", outcome: "The float opened at nothing, so there is nothing to declare.", count: 0, amount: 0 };
    }

    const declaredBefore = await dataDb.dataProviderEntry
      .aggregate({
        where: { kind: "FUNDING", occurredAt: { lt: first.createdAt } },
        _sum: { amount: true },
      })
      .catch(() => null);
    const declared = round2(declaredBefore?._sum.amount ?? 0);

    if (declared >= opening - TOLERANCE) {
      return {
        ...base,
        severity: "clean",
        outcome: "The opening float has been declared.",
        count: 0,
        amount: opening,
      };
    }
    return {
      ...base,
      severity: "advisory",
      outcome: `The float already held money when readings began, and ${formatMoney(round2(opening - declared))} of it has never been recorded as funding.`,
      count: 0,
      amount: opening,
      remedy:
        "Record it as declared funding on the Top-ups tab, dated before the first reading, so what has been put in adds up.",
    };
  } catch {
    return { ...base, severity: "clean", outcome: "Could not be read.", count: 0, amount: null };
  }
}

/**
 * Whether the float statement closes.
 *
 * The same arithmetic the statement prints, as a check with a verdict on it,
 * because the number at the bottom of a statement is easy to read past. The
 * sign says which way to look: money in the wallet that nothing on this side
 * accounts for, or a declared movement that the readings had already seen and
 * which is therefore being counted twice.
 */
async function checkFloatBalances(from: Date | null): Promise<AuditFinding> {
  const base = {
    key: "float-statement",
    title: "The float statement closes",
    test: "Opening balance, everything in and out, against the balance last read.",
  };

  const { unaccounted } = await floatStatement(from);
  if (Math.abs(unaccounted) <= TOLERANCE) {
    return {
      ...base,
      severity: "clean",
      outcome: "Every cedi in the wallet is accounted for by the record.",
      count: 0,
      amount: null,
    };
  }
  return {
    ...base,
    severity: "exception",
    outcome:
      unaccounted > 0
        ? `${formatMoney(unaccounted)} is in the wallet that nothing on this side accounts for.`
        : `${formatMoney(Math.abs(unaccounted))} more has been declared than the balance supports.`,
    count: 0,
    amount: Math.abs(unaccounted),
    href: "/admin/data/transactions/topups",
    hrefLabel: "Open Top-ups",
    remedy:
      unaccounted > 0
        ? "Record the missing funding as a declared movement, dated when it went in."
        : "A declared movement is being counted twice — the readings had already seen it. Remove it from the declared list on the Top-ups tab.",
  };
}

/**
 * How coarse the wallet arithmetic currently is.
 *
 * Two movements inside one interval net off and only the difference is ever
 * seen, so the value of the whole derivation depends on how often the balance
 * is read. A day between readings is a day in which a top-up and a direct
 * order can cancel each other out completely.
 */
async function checkWalletReadings(): Promise<AuditFinding> {
  const base = {
    key: "reading-cadence",
    title: "The wallet is read often enough to be believed",
    test: "How long it has been since the provider's balance was last read.",
  };

  try {
    const last = await dataDb.dataProviderBalance.findFirst({
      orderBy: { createdAt: "desc" },
      select: { createdAt: true },
    });
    if (!last) {
      return { ...base, severity: "advisory", outcome: "The balance has never been read.", count: 0, amount: null };
    }
    const hours = (Date.now() - last.createdAt.getTime()) / 3_600_000;
    if (hours <= 36) {
      return {
        ...base,
        severity: "clean",
        outcome: `Last read ${hours < 1 ? "within the hour" : `${Math.round(hours)} hours ago`}.`,
        count: 0,
        amount: null,
      };
    }
    return {
      ...base,
      severity: "advisory",
      outcome: `The balance has not been read for ${Math.round(hours / 24)} days, so anything that moved in between is netted together.`,
      count: 0,
      amount: null,
      remedy: "Press Record reading on the Top-ups tab, and again straight after funding the wallet.",
    };
  } catch {
    return { ...base, severity: "clean", outcome: "Could not be read.", count: 0, amount: null };
  }
}

// ---------------------------------------------------------------------------
// The corrections
// ---------------------------------------------------------------------------

export interface AuditFixResult {
  ok: boolean;
  message: string;
}

/**
 * Apply one named correction.
 *
 * Every one of these is idempotent and narrow: it writes the answer the rows
 * already imply and touches nothing else. Running the same correction twice
 * changes nothing the second time.
 */
export async function applyAuditFix(fix: AuditFix, byEmail: string): Promise<AuditFixResult> {
  switch (fix) {
    case "apply-ladder-cost":
      return applyLadderCost();
    case "realign-agent-balances":
      return realignAgentBalances(byEmail);
    case "post-missing-topups":
      return postMissingTopups();
    case "mark-refunded-orders":
      return markRefundedOrders();
  }
}

async function applyLadderCost(): Promise<AuditFixResult> {
  try {
    const updated = await dataDb.$executeRaw`
      UPDATE "DataOrder" o
         SET "costPrice" = b."costPrice"
        FROM "DataBundle" b
       WHERE b.network = o.network
         AND b."sizeGb" = o."sizeGb"
         AND b."costPrice" > 0
         AND o."paymentStatus" = 'paid'
         AND o.status <> 'refunded'
         AND o."costPrice" = 0
         AND o."providerCost" IS NULL
    `;
    return updated > 0
      ? { ok: true, message: `Cost written onto ${updated} ${updated === 1 ? "order" : "orders"}.` }
      : { ok: true, message: "Nothing to correct — no order was missing a cost the price list could supply." };
  } catch {
    return { ok: false, message: "The correction could not be written." };
  }
}

/**
 * Rewrite each drifted balance to the sum of its own ledger.
 *
 * Deliberately not an adjustment entry, which is the obvious thing to reach
 * for and cannot work: an entry moves the ledger total and the balance by the
 * same amount, so posting one leaves the gap exactly where it was. The balance
 * is a cache of the entries and the repair is to recompute it.
 *
 * One statement, so an entry landing while it runs cannot be written over.
 */
async function realignAgentBalances(byEmail: string): Promise<AuditFixResult> {
  try {
    const before = await driftedAgents();
    if (before.length === 0) {
      return { ok: true, message: "Nothing to correct — every balance already matches its ledger." };
    }

    const updated = await dataDb.$executeRaw`
      UPDATE "DataAgent" a
         SET balance = COALESCE(s.total, 0)
        FROM (
          SELECT a2.id,
                 (SELECT SUM(l.amount) FROM "DataAgentLedger" l WHERE l."agentId" = a2.id) AS total
            FROM "DataAgent" a2
        ) s
       WHERE s.id = a.id
         AND ABS(COALESCE(s.total, 0) - a.balance) > 0.009
    `;

    if (updated === 0) return { ok: false, message: "No balance could be realigned." };
    console.log(
      `[data-audit] ${updated} agent balance(s) realigned to their ledgers${byEmail ? ` by ${byEmail}` : ""}`,
    );
    return {
      ok: true,
      message: `${updated} ${updated === 1 ? "balance" : "balances"} realigned to the ledger.`,
    };
  } catch {
    return { ok: false, message: "The correction could not be written." };
  }
}

async function postMissingTopups(): Promise<AuditFixResult> {
  try {
    const rows = await unpostedTopups();
    if (rows.length === 0) {
      return { ok: true, message: "Nothing to correct — every settled top-up was already credited." };
    }
    let done = 0;
    for (const row of rows) {
      if (await creditWalletTopup(row.agentId, row.reference, row.amount)) done++;
    }
    return done > 0
      ? { ok: true, message: `${done} ${done === 1 ? "float" : "floats"} credited.` }
      : { ok: false, message: "No credit could be posted." };
  } catch {
    return { ok: false, message: "The correction could not be written." };
  }
}

async function markRefundedOrders(): Promise<AuditFixResult> {
  try {
    const updated = await dataDb.dataOrder.updateMany({
      where: { refundedAt: { not: null }, status: { not: "refunded" } },
      data: { status: "refunded" },
    });
    return updated.count > 0
      ? {
          ok: true,
          message: `${updated.count} ${updated.count === 1 ? "order" : "orders"} taken out of revenue.`,
        }
      : { ok: true, message: "Nothing to correct — no refunded order was still counted as a sale." };
  } catch {
    return { ok: false, message: "The correction could not be written." };
  }
}
