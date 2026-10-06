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
  /**
   * Positive on everything that added to whatever it touched, negative on the
   * few that took away without money leaving the business — an adjustment that
   * debits an agent. Money leaving outright is positive with an "out" flow.
   */
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
 * The sources, shaped the same way.
 *
 * Written once as SQL because Prisma cannot union across models, and because
 * the alternative — several paged queries merged in memory — cannot give an
 * exact page or an exact total without reading everything first.
 *
 * Three things here exist to stop the same cedi being counted twice, or not at
 * all. They are the whole reason this is longer than a list of tables:
 *
 *   1. An order paid out of an agent's float is not new money. The cash came in
 *      when the float was topped up; banking it again on the order would have
 *      a GH₵100 top-up spent on GH₵100 of bundles read as GH₵200 in. So such
 *      an order is WALLET_ORDER and moves inside rather than in.
 *   2. A top-up credited to a wallet without a top-up row behind it — a
 *      payment settled from its Paystack metadata, which is what happens when
 *      the row could not be written before the agent reached the gateway — was
 *      invisible here, because the ledger's own copy of a top-up is excluded as
 *      a duplicate of a row that in that case does not exist. It is picked up
 *      from the ledger when, and only when, there is no row to duplicate.
 *   3. A paid order marked refunded used to stand as a full sale. Where the
 *      refund went back to the card there is now a REFUND row against it, so
 *      the two net to nothing; where it went to the agent's float instead, the
 *      float credit is the internal move it really was and the sale stands,
 *      because Nickimart kept the cash.
 */
function sourcesSql(): Prisma.Sql {
  return Prisma.sql`
    SELECT o.id,
           CASE WHEN float_paid.reference IS NULL THEN 'BUNDLE_ORDER' ELSE 'WALLET_ORDER' END AS kind,
           o.price AS amount,
           o.reference,
           COALESCE(NULLIF(o."buyerName", ''), o."buyerPhone") AS party,
           o.network || ' · ' || o."recipientPhone" AS detail,
           o.status,
           o."createdAt" AS createdat,
           o."agentId" AS agentid
      FROM "DataOrder" o
      LEFT JOIN (
        SELECT DISTINCT reference
          FROM "DataAgentLedger"
         WHERE type = 'WALLET_ORDER' AND reference IS NOT NULL
      ) float_paid ON float_paid.reference = o.reference
     WHERE o."paymentStatus" = 'paid'

    -- The money going back out on a refunded sale. Only where it went back to
    -- the card: a refund credited to an agent's float is already in this list
    -- as that credit, and the cash never left.
    UNION ALL
    SELECT o.id || ':refund', 'REFUND', o.price, o.reference,
           COALESCE(NULLIF(o."buyerName", ''), o."buyerPhone"),
           'Refunded · ' || o.network || ' · ' || o."recipientPhone",
           'refunded',
           -- Rows refunded before refundedAt existed fall back to the moment
           -- the status was flipped, which is the same thing for all of them.
           COALESCE(o."refundedAt", o."updatedAt"),
           o."agentId"
      FROM "DataOrder" o
      LEFT JOIN (
        SELECT DISTINCT reference
          FROM "DataAgentLedger"
         WHERE type = 'ORDER_REFUND' AND reference IS NOT NULL
      ) to_float ON to_float.reference = o.reference
     WHERE o."paymentStatus" = 'paid'
       AND o.status = 'refunded'
       AND to_float.reference IS NULL
       AND o.price > 0

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

    -- A top-up that reached the balance without a settled row behind it. The
    -- join tests for a paid row, not merely that a row exists: the credit and
    -- the row are two writes, and when the second one fails the money is on
    -- the balance with the row still saying "pending". Joining on the row
    -- alone would suppress the credit as a duplicate of a row that never
    -- recorded it, which is the same disappearance by another route.
    UNION ALL
    SELECT l.id, 'WALLET_TOPUP', ABS(l.amount), COALESCE(l.reference, ''),
           ag."storeName", 'Wallet top-up · ' || ag.code, 'paid',
           l."createdAt", l."agentId"
      FROM "DataAgentLedger" l
      JOIN "DataAgent" ag ON ag.id = l."agentId"
      LEFT JOIN "DataWalletTopup" t
        ON t.reference = l.reference AND t.status = 'paid'
     WHERE l.type = 'WALLET_TOPUP' AND t.id IS NULL

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
             WHEN l.type IN ('ORDER_REFUND') THEN 'WALLET_REFUND'
             ELSE 'ADJUSTMENT'
           END,
           -- Signed, not absolute. An adjustment can go either way, and an
           -- admin debiting an agent GH₵500 used to read as "+GH₵500.00" —
           -- the one row on this screen that said the opposite of what had
           -- happened. Every other type in this branch is a credit anyway, so
           -- keeping the sign changes nothing but the one that needed it.
           l.amount, COALESCE(l.reference, ''), ag."storeName",
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
  WALLET_ORDER: "internal",
  COMMISSION: "internal",
  REFERRAL: "internal",
  ADJUSTMENT: "internal",
  WALLET_REFUND: "internal",
  REFUND: "out",
  WITHDRAWAL: "out",
};

function hrefFor(row: RawRow): string {
  switch (row.kind) {
    case "BUNDLE_ORDER":
    case "WALLET_ORDER":
    case "REFUND":
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
          // Not absolute: see the ledger branch above.
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
