import "server-only";
import { Prisma } from ".prisma/data-client";
import { dataDb } from "@/lib/data-db";
import { formatMoney } from "@/lib/format";
import { round2 } from "@/lib/data-bundles/agent-pricing";
import { TOPUP_KINDS, transactionKind } from "@/lib/transaction-kinds";
import type { TransactionRow } from "@/lib/data-bundles/transactions";

/**
 * Every top-up, on both sides of the business.
 *
 * Money arrives in two places and only one of them was written down. An agent
 * putting cash on their float went through Paystack and left a row; the money
 * put into the provider's wallet — the float every bundle is actually bought
 * from — happened on the provider's own site and left nothing here at all. So
 * "how much have I really put in" could not be answered from this console,
 * which is the one question a float business is run on.
 *
 * This is both, in one list. The agent side is read from the same rows the
 * ledger reads, so the two tabs cannot disagree. The provider side is derived
 * from readings of its balance (see lib/data-bundles/provider-ledger): money
 * that appeared is funding somebody added, and money that left without one of
 * our orders behind it is an order placed on the provider's platform directly.
 */

const PROVIDER_PARTY = "Provider wallet";

export interface TopupListOptions {
  kind?: string;
  query?: string;
  /** Days back; 0 for everything. */
  days?: number;
  page?: number;
  perPage?: number;
}

export interface TopupTotals {
  /** Agent floats topped up through Paystack. */
  agent: number;
  /** Put into the provider's wallet. */
  providerFunding: number;
  /** Taken out of it by orders Nickimart did not place. */
  providerDebits: number;
}

interface RawRow {
  id: string;
  kind: string;
  amount: number;
  reference: string;
  party: string;
  detail: string;
  status: string;
  createdat: Date;
  agentid: string | null;
  /** The provider balance after a reading; null on an agent top-up. */
  balance: number | null;
  /** What the admin wrote against a declared movement; blank otherwise. */
  note: string;
}

/**
 * The three sources, shaped the same way.
 *
 * The two agent branches are the ones the ledger uses, for the same reason:
 * a top-up normally has a row of its own, and a top-up settled from its
 * Paystack metadata — which is what happens when the row could not be written
 * before the agent reached the gateway — has only a ledger credit. Taking the
 * ledger credit only where there is no row is what keeps a top-up from being
 * counted twice while still never losing one.
 */
function sourcesSql(): Prisma.Sql {
  return Prisma.sql`
    SELECT t.id,
           'WALLET_TOPUP' AS kind,
           CASE WHEN t."creditedAmount" > 0 THEN t."creditedAmount" ELSE t.amount END AS amount,
           t.reference,
           ag."storeName" AS party,
           'Agent float · ' || ag.code AS detail,
           t.status,
           COALESCE(t."paidAt", t."createdAt") AS createdat,
           t."agentId" AS agentid,
           NULL::float8 AS balance,
           '' AS note
      FROM "DataWalletTopup" t
      JOIN "DataAgent" ag ON ag.id = t."agentId"
     WHERE t.status = 'paid'

    -- Settled, not merely present: a credit on the balance whose row still
    -- says "pending" is a top-up that happened, and joining on the row alone
    -- would hide it as a duplicate of a row that never recorded it.
    UNION ALL
    SELECT l.id, 'WALLET_TOPUP', ABS(l.amount), COALESCE(l.reference, ''),
           ag."storeName", 'Agent float · ' || ag.code, 'paid',
           l."createdAt", l."agentId", NULL::float8, ''
      FROM "DataAgentLedger" l
      JOIN "DataAgent" ag ON ag.id = l."agentId"
      LEFT JOIN "DataWalletTopup" t
        ON t.reference = l.reference AND t.status = 'paid'
     WHERE l.type = 'WALLET_TOPUP' AND t.id IS NULL

    -- Money that appeared in the provider's wallet beyond what our own orders
    -- took out of it: somebody funded it.
    UNION ALL
    SELECT b.id || ':in', 'PROVIDER_FUNDING', b.credited, '',
           ${PROVIDER_PARTY}, '', b.source, b."createdAt", NULL, b.balance, ''
      FROM "DataProviderBalance" b
     WHERE b.credited > 0

    -- Money that left it without one of our orders behind it: an order placed
    -- on the provider's own platform. Negative, because the float went down —
    -- the cash itself left earlier, when the float was funded, so the row is
    -- not "money out" but it is certainly not a plus.
    UNION ALL
    SELECT b.id || ':out', 'PROVIDER_DEBIT', -b.debited, '',
           ${PROVIDER_PARTY}, '', b.source, b."createdAt", NULL, b.balance, ''
      FROM "DataProviderBalance" b
     WHERE b.debited > 0

    -- Movements an administrator declared because no reading could have seen
    -- them: anything before readings began, and anything that netted off
    -- against a day's trading inside one interval. Dated by when the money
    -- moved rather than when it was typed, so a top-up entered today for last
    -- March sorts into last March.
    UNION ALL
    SELECT e.id, CASE WHEN e.kind = 'FUNDING' THEN 'PROVIDER_FUNDING' ELSE 'PROVIDER_DEBIT' END,
           CASE WHEN e.kind = 'FUNDING' THEN e.amount ELSE -e.amount END, '',
           ${PROVIDER_PARTY}, '', 'recorded', e."occurredAt", NULL, NULL::float8, e.note
      FROM "DataProviderEntry" e
  `;
}

function detailFor(row: RawRow): string {
  if (row.kind === "WALLET_TOPUP") return row.detail;
  // A declared movement says so, and says what the admin wrote against it.
  // A figure somebody asserted and one the provider's balance proved are not
  // the same evidence, and a reconciliation that cannot tell them apart is
  // not a reconciliation.
  if (row.status === "recorded") {
    const what = row.kind === "PROVIDER_FUNDING" ? "Funding entered by hand" : "Spend entered by hand";
    return row.note ? `${what} · ${row.note}` : what;
  }
  const after = row.balance === null ? "" : ` · balance ${formatMoney(row.balance)}`;
  return row.kind === "PROVIDER_FUNDING"
    ? `Funded on the provider's platform${after}`
    : `Spent outside Nickimart${after}`;
}

function hrefFor(row: RawRow): string {
  if (row.kind === "WALLET_TOPUP") {
    return row.agentid ? `/admin/data/agents/${row.agentid}` : "/admin/data/agents";
  }
  return "/admin/data";
}

export async function getTopups(opts: TopupListOptions = {}) {
  const page = Math.max(1, opts.page ?? 1);
  const perPage = opts.perPage ?? 25;

  const wheres: Prisma.Sql[] = [];
  if (opts.days && opts.days > 0) {
    const since = new Date();
    since.setHours(0, 0, 0, 0);
    since.setDate(since.getDate() - (opts.days - 1));
    wheres.push(Prisma.sql`t.createdat >= ${since}`);
  }
  if (opts.kind && opts.kind !== "all" && (TOPUP_KINDS as readonly string[]).includes(opts.kind)) {
    wheres.push(Prisma.sql`t.kind = ${opts.kind}`);
  }
  const term = (opts.query ?? "").trim();
  if (term) {
    const like = `%${term}%`;
    wheres.push(
      Prisma.sql`(t.reference ILIKE ${like} OR t.party ILIKE ${like} OR t.detail ILIKE ${like})`,
    );
  }
  const where =
    wheres.length > 0 ? Prisma.sql`WHERE ${Prisma.join(wheres, " AND ")}` : Prisma.empty;

  const empty = {
    rows: [] as TransactionRow[],
    total: 0,
    totals: { agent: 0, providerFunding: 0, providerDebits: 0 } as TopupTotals,
  };

  try {
    const [rows, counted, summed] = await Promise.all([
      dataDb.$queryRaw<RawRow[]>`
        SELECT * FROM (${sourcesSql()}) t
        ${where}
        ORDER BY t.createdat DESC
        LIMIT ${perPage} OFFSET ${(page - 1) * perPage}
      `,
      dataDb.$queryRaw<{ count: bigint }[]>`
        SELECT COUNT(*)::bigint AS count FROM (${sourcesSql()}) t ${where}
      `,
      dataDb.$queryRaw<{ kind: string; total: number }[]>`
        SELECT t.kind, SUM(t.amount)::float8 AS total
          FROM (${sourcesSql()}) t ${where}
         GROUP BY t.kind
      `,
    ]);

    const totals: TopupTotals = { agent: 0, providerFunding: 0, providerDebits: 0 };
    for (const s of summed) {
      const value = round2(s.total ?? 0);
      if (s.kind === "WALLET_TOPUP") totals.agent = value;
      else if (s.kind === "PROVIDER_FUNDING") totals.providerFunding = value;
      // Carried as a negative above; the tile names the direction itself, so
      // it wants the size of the spend rather than its sign.
      else if (s.kind === "PROVIDER_DEBIT") totals.providerDebits = Math.abs(value);
    }

    return {
      rows: rows.map((r): TransactionRow => ({
        id: r.id,
        kind: r.kind,
        // Taken from the shared table rather than restated here. A local copy
        // of it is how funding the provider float went on reading as a loss
        // after the shared definition had been corrected to call it the
        // transfer it is.
        flow: transactionKind(r.kind)?.flow ?? "in",
        // Signed, not absolute: a provider debit is a minus on a tab where
        // everything else is money arriving.
        amount: round2(r.amount),
        reference: r.reference || "—",
        party: r.party || "—",
        detail: detailFor(r),
        status: r.status,
        createdAt: r.createdat,
        href: hrefFor(r),
        agentId: r.agentid,
      })),
      total: Number(counted[0]?.count ?? 0),
      totals,
    };
  } catch {
    // Tables not migrated, or the database is briefly unreachable.
    return empty;
  }
}
