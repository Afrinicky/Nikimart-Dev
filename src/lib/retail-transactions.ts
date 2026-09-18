import "server-only";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { signedAmount, type Flow } from "@/lib/transaction-kinds";

/**
 * Every movement of money in the mall, in one list.
 *
 * The same idea as the bundle side's, and deliberately not the same data: the
 * two businesses keep separate books in separate databases, and a screen that
 * mixed a bundle sale with a shop payout would be a screen nobody could
 * reconcile against either. Same shape, same words, same controls — different
 * rows, and never the twain.
 *
 * A UNION over the rows that already exist rather than a transactions table of
 * its own, for the same reason: a second copy of a fact is a thing that can
 * disagree with the first.
 */

export interface RetailTransactionRow {
  id: string;
  kind: string;
  flow: Flow;
  amount: number;
  reference: string;
  party: string;
  detail: string;
  status: string;
  createdAt: Date;
  href: string;
}

export interface RetailTransactionOptions {
  kind?: string;
  flow?: string;
  query?: string;
  days?: number;
  page?: number;
  perPage?: number;
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
  targetid: string | null;
}

function sourcesSql(): Prisma.Sql {
  return Prisma.sql`
    -- What a customer has actually paid, which is not the same as what an
    -- order is worth: a part-paid order has money in against it and a balance
    -- still due, and a ledger must show the money, not the invoice.
    SELECT o.id,
           'ORDER_PAYMENT' AS kind,
           o."amountPaid" AS amount,
           o."orderNumber" AS reference,
           COALESCE(NULLIF(u.name, ''), u.email) AS party,
           CASE WHEN o."balanceDue" > 0
                THEN 'Part payment · ' || o.status
                ELSE 'Paid in full · ' || o.status END AS detail,
           o.status,
           o."createdAt" AS createdat,
           o.id AS targetid
      FROM "Order" o
      JOIN "User" u ON u.id = o."userId"
     WHERE o."amountPaid" > 0

    UNION ALL
    SELECT p.id, 'VENDOR_PAYOUT', p.amount, COALESCE(p.reference, ''),
           v."businessName", COALESCE(NULLIF(p.method, ''), 'Payout'), p.status,
           COALESCE(p."paidAt", p."createdAt"), v.id
      FROM "Payout" p
      JOIN "Vendor" v ON v.id = p."vendorId"
     -- Only what has actually been sent. A payout still queued is a plan, and
     -- a ledger that counts plans as money out cannot be reconciled against a
     -- bank statement — it lives in Finance until somebody sends it.
     WHERE p.status = 'paid' 

    UNION ALL
    -- An affiliate carries its own name rather than borrowing one from a user
    -- account: some are people who never signed up, and a payout still has to
    -- say who it went to.
    SELECT ap.id, 'AFFILIATE_PAYOUT', ap.amount, COALESCE(ap.reference, ''),
           a.name, COALESCE(NULLIF(ap.method, ''), 'Payout'), ap.status,
           COALESCE(ap."paidAt", ap."createdAt"), a.id
      FROM "AffiliatePayout" ap
      JOIN "Affiliate" a ON a.id = ap."affiliateId"
     WHERE ap.status = 'paid' 
  `;
}

const FLOW_BY_KIND: Record<string, Flow> = {
  ORDER_PAYMENT: "in",
  VENDOR_PAYOUT: "out",
  AFFILIATE_PAYOUT: "out",
};

function hrefFor(row: RawRow): string {
  if (row.kind === "ORDER_PAYMENT") return `/admin/orders/${row.targetid}`;
  if (row.kind === "VENDOR_PAYOUT") return `/admin/vendors/${row.targetid}`;
  return `/admin/affiliates/${row.targetid}`;
}

export async function getRetailTransactions(opts: RetailTransactionOptions = {}) {
  const page = Math.max(1, opts.page ?? 1);
  const perPage = opts.perPage ?? 25;

  const wheres: Prisma.Sql[] = [];
  if (opts.days && opts.days > 0) {
    const since = new Date();
    since.setHours(0, 0, 0, 0);
    since.setDate(since.getDate() - (opts.days - 1));
    wheres.push(Prisma.sql`t.createdat >= ${since}`);
  }
  if (opts.kind && opts.kind !== "all") wheres.push(Prisma.sql`t.kind = ${opts.kind}`);
  if (opts.flow && opts.flow !== "all") {
    const kinds = Object.entries(FLOW_BY_KIND)
      .filter(([, f]) => f === opts.flow)
      .map(([k]) => k);
    wheres.push(
      kinds.length ? Prisma.sql`t.kind IN (${Prisma.join(kinds)})` : Prisma.sql`false`,
    );
  }
  const term = (opts.query ?? "").trim();
  if (term) {
    const like = `%${term}%`;
    wheres.push(
      Prisma.sql`(t.reference ILIKE ${like} OR t.party ILIKE ${like} OR t.detail ILIKE ${like})`,
    );
  }
  const where = wheres.length ? Prisma.sql`WHERE ${Prisma.join(wheres, " AND ")}` : Prisma.empty;

  try {
    const [rows, counted, summed] = await Promise.all([
      prisma.$queryRaw<RawRow[]>`
        SELECT * FROM (${sourcesSql()}) t
        ${where}
        ORDER BY t.createdat DESC
        LIMIT ${perPage} OFFSET ${(page - 1) * perPage}
      `,
      prisma.$queryRaw<{ count: bigint }[]>`
        SELECT COUNT(*)::bigint AS count FROM (${sourcesSql()}) t ${where}
      `,
      prisma.$queryRaw<{ kind: string; total: number }[]>`
        SELECT t.kind, SUM(t.amount)::float8 AS total
          FROM (${sourcesSql()}) t ${where}
         GROUP BY t.kind
      `,
    ]);

    const totals = { in: 0, out: 0, internal: 0 };
    for (const s of summed) {
      const flow = FLOW_BY_KIND[s.kind] ?? "internal";
      totals[flow] = Math.round((totals[flow] + (s.total ?? 0)) * 100) / 100;
    }

    return {
      rows: rows.map((r): RetailTransactionRow => ({
        id: r.id,
        kind: r.kind,
        flow: FLOW_BY_KIND[r.kind] ?? "internal",
        amount: Math.round(r.amount * 100) / 100,
        reference: r.reference || "—",
        party: r.party || "—",
        detail: r.detail || "",
        status: r.status,
        createdAt: r.createdat,
        href: hrefFor(r),
      })),
      total: Number(counted[0]?.count ?? 0),
      totals,
    };
  } catch {
    return { rows: [], total: 0, totals: { in: 0, out: 0, internal: 0 } };
  }
}

export { signedAmount };
