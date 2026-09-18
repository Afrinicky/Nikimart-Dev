import "server-only";
import { Prisma } from ".prisma/data-client";
import { dataDb } from "@/lib/data-db";
import { round2 } from "@/lib/data-bundles/agent-pricing";
import { signedAmount, type Flow } from "@/lib/transaction-kinds";

/**
 * Every movement of money in the bundle business, in one list.
 *
 * The figures were always there — an order here, a top-up there, a ledger
 * entry somewhere else — but never in one place, so "what happened to the
 * money on Tuesday" meant opening four screens and adding up by hand.
 *
 * Built as a UNION rather than a new table. A transactions table would be a
 * second copy of facts that already exist, and a second copy is a thing that
 * can disagree with the first: an order refunded but its transaction row left
 * behind, a top-up credited twice in one place and once in the other. This
 * reads the same rows the rest of the console reads, so it cannot drift — and
 * because it is one query, the paging and the totals are exact rather than
 * assembled from six lists and hoped over.
 *
 * Every row carries where it came from, so a line in the list is a link to the
 * thing itself rather than a dead end.
 */

export interface TransactionRow {
  id: string;
  kind: string;
  flow: Flow;
  /** Always positive here; the sign comes from the flow. */
  amount: number;
  reference: string;
  /** Who it involved — a buyer, an agent, a store. */
  party: string;
  detail: string;
  status: string;
  createdAt: Date;
  /** Where in the console this movement actually lives. */
  href: string;
  agentId: string | null;
}

export interface TransactionListOptions {
  kind?: string;
  flow?: string;
  query?: string;
  /** Days back; 0 for everything. */
  days?: number;
  page?: number;
  perPage?: number;
  agentId?: string;
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
}

/**
 * The six sources, shaped the same way.
 *
 * Written once as SQL because Prisma cannot union across models, and because
 * the alternative — six paged queries merged in memory — cannot give an exact
 * page or an exact total without reading everything first.
 */
function sourcesSql(): Prisma.Sql {
  return Prisma.sql`
    SELECT o.id,
           'BUNDLE_ORDER' AS kind,
           o.price AS amount,
           o.reference,
           COALESCE(NULLIF(o."buyerName", ''), o."buyerPhone") AS party,
           o.network || ' · ' || o."recipientPhone" AS detail,
           o.status,
           o."createdAt" AS createdat,
           o."agentId" AS agentid
      FROM "DataOrder" o
     WHERE o."paymentStatus" = 'paid'

    UNION ALL
    SELECT a.id, 'AFA', a.price, a.reference, a."fullName",
           'AFA · ' || a."phoneNumber", a.status, a."createdAt", a."agentId"
      FROM "AfaRegistration" a
     WHERE a."paymentStatus" = 'paid'

    UNION ALL
    SELECT t.id, 'WALLET_TOPUP',
           CASE WHEN t."creditedAmount" > 0 THEN t."creditedAmount" ELSE t.amount END,
           t.reference, ag."storeName", 'Wallet top-up · ' || ag.code, t.status,
           COALESCE(t."paidAt", t."createdAt"), t."agentId"
      FROM "DataWalletTopup" t
      JOIN "DataAgent" ag ON ag.id = t."agentId"
     WHERE t.status = 'paid'

    UNION ALL
    SELECT w.id, 'WITHDRAWAL', w.amount,
           COALESCE(w."momoPhone", ''), ag."storeName",
           w."momoNetwork" || ' · ' || w."momoName", w.status,
           COALESCE(w."processedAt", w."createdAt"), w."agentId"
      FROM "DataAgentWithdrawal" w
      JOIN "DataAgent" ag ON ag.id = w."agentId"
     WHERE w.status = 'processed'

    UNION ALL
    SELECT l.id,
           CASE
             WHEN l.type IN ('SETUP_FEE_PAYMENT') THEN 'REGISTRATION_FEE'
             WHEN l.type IN ('COMMISSION', 'TEAM_COMMISSION') THEN 'COMMISSION'
             WHEN l.type IN ('REFERRAL_L1', 'REFERRAL_L2', 'REFERRAL_FEE_SHARE') THEN 'REFERRAL'
             WHEN l.type IN ('ORDER_REFUND') THEN 'REFUND'
             ELSE 'ADJUSTMENT'
           END,
           ABS(l.amount), COALESCE(l.reference, ''), ag."storeName",
           l.narration, 'posted', l."createdAt", l."agentId"
      FROM "DataAgentLedger" l
      JOIN "DataAgent" ag ON ag.id = l."agentId"
     -- The wallet's own bookkeeping is already in this list under its real
     -- source: a top-up as the top-up, a payout as the payout, an order paid
     -- from the wallet as the order. Including the mirror entries too would
     -- count the same cedi twice.
     WHERE l.type NOT IN ('WALLET_TOPUP', 'WITHDRAWAL', 'WITHDRAWAL_REVERSAL', 'WALLET_ORDER', 'SETUP_FEE')
  `;
}

const FLOW_BY_KIND: Record<string, Flow> = {
  BUNDLE_ORDER: "in",
  AFA: "in",
  WALLET_TOPUP: "in",
  REGISTRATION_FEE: "in",
  COMMISSION: "internal",
  REFERRAL: "internal",
  ADJUSTMENT: "internal",
  REFUND: "out",
  WITHDRAWAL: "out",
};

function hrefFor(row: RawRow): string {
  switch (row.kind) {
    case "BUNDLE_ORDER":
      return `/admin/data/orders?q=${encodeURIComponent(row.reference)}`;
    case "AFA":
      return "/admin/data/afa";
    case "WITHDRAWAL":
      return `/admin/data/withdrawals/${row.id}`;
    case "WALLET_TOPUP":
      return row.agentid ? `/admin/data/agents/${row.agentid}` : "/admin/data/agents";
    default:
      return row.agentid ? `/admin/data/agents/${row.agentid}` : "/admin/data/agents";
  }
}

export async function getTransactions(opts: TransactionListOptions = {}) {
  const page = Math.max(1, opts.page ?? 1);
  const perPage = opts.perPage ?? 25;

  const wheres: Prisma.Sql[] = [];
  if (opts.days && opts.days > 0) {
    const since = new Date();
    since.setHours(0, 0, 0, 0);
    since.setDate(since.getDate() - (opts.days - 1));
    wheres.push(Prisma.sql`t.createdat >= ${since}`);
  }
  if (opts.kind && opts.kind !== "all") {
    wheres.push(Prisma.sql`t.kind = ${opts.kind}`);
  }
  if (opts.flow && opts.flow !== "all") {
    const kinds = Object.entries(FLOW_BY_KIND)
      .filter(([, f]) => f === opts.flow)
      .map(([k]) => k);
    wheres.push(Prisma.sql`t.kind IN (${Prisma.join(kinds)})`);
  }
  if (opts.agentId) {
    wheres.push(Prisma.sql`t.agentid = ${opts.agentId}`);
  }
  const term = (opts.query ?? "").trim();
  if (term) {
    const like = `%${term}%`;
    wheres.push(
      Prisma.sql`(t.reference ILIKE ${like} OR t.party ILIKE ${like} OR t.detail ILIKE ${like})`,
    );
  }
  const where =
    wheres.length > 0
      ? Prisma.sql`WHERE ${Prisma.join(wheres, " AND ")}`
      : Prisma.empty;

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

    const totals = { in: 0, out: 0, internal: 0 };
    for (const s of summed) {
      const flow = FLOW_BY_KIND[s.kind] ?? "internal";
      totals[flow] = round2(totals[flow] + (s.total ?? 0));
    }

    return {
      rows: rows.map((r): TransactionRow => {
        const flow = FLOW_BY_KIND[r.kind] ?? "internal";
        return {
          id: r.id,
          kind: r.kind,
          flow,
          amount: round2(r.amount),
          reference: r.reference || "—",
          party: r.party || "—",
          detail: r.detail || "",
          status: r.status,
          createdAt: r.createdat,
          href: hrefFor(r),
          agentId: r.agentid,
        };
      }),
      total: Number(counted[0]?.count ?? 0),
      totals,
    };
  } catch {
    // Tables not migrated, or the database is briefly unreachable.
    return { rows: [], total: 0, totals: { in: 0, out: 0, internal: 0 } };
  }
}

export { signedAmount };
