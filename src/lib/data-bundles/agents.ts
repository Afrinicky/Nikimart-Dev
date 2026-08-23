import "server-only";
import { cache } from "react";
import { prisma } from "@/lib/prisma";
import { getActiveBundles } from "@/lib/data-bundles/catalog";
import { NETWORKS, type Network } from "@/lib/data-bundles/networks";
import { normaliseSlugClient } from "@/lib/data-bundles/slug";
import { outstandingSetupFee, round2 } from "@/lib/data-bundles/agent-pricing";

/**
 * Reads for the sub-agent platform.
 *
 * The money model in one paragraph: NikiMart buys from Justice Datashop and
 * resells to its own agents at `DataBundle.agentPrice`. An agent puts their own
 * price on top of that and sells it from `/store/<slug>`; the customer pays
 * NikiMart through Paystack, and the difference is the agent's commission —
 * credited only once the bundle has actually been delivered. Opening a store
 * costs a setup fee, charged as a debit, so an agent account starts on a
 * negative balance that clears itself out of their first commissions.
 *
 * Nothing here writes. Every balance movement goes through agent-actions.ts,
 * which always writes a ledger row alongside the balance it changes.
 */

export interface AgentAccount {
  id: string;
  userId: string;
  code: string;
  slug: string;
  storeName: string;
  storeTagline: string;
  storeAbout: string;
  storeOpen: boolean;
  supportPhone: string;
  supportWhatsapp: string;
  whatsappGroup: string;
  afaPrice: number;
  afaEnabled: boolean;
  status: string;
  balance: number;
  setupFee: number;
  createdAt: Date;
}

/** The agent account attached to a user, or null if they aren't one. */
export const getAgentForUser = cache(async (userId: string): Promise<AgentAccount | null> => {
  try {
    return await prisma.dataAgent.findUnique({ where: { userId } });
  } catch {
    // DataAgent table not migrated yet — treat it as "not an agent" so the
    // rest of the site keeps working.
    return null;
  }
});

/** An agent by their public store slug, for /store/<slug>. */
export async function getAgentBySlug(slug: string): Promise<AgentAccount | null> {
  try {
    return await prisma.dataAgent.findUnique({ where: { slug: slug.toLowerCase() } });
  } catch {
    return null;
  }
}

/** True when this agent may currently sell (active, and store not closed). */
export function agentIsSelling(agent: AgentAccount): boolean {
  return agent.status === "active" && agent.storeOpen;
}

// ---------------------------------------------------------------------------
// Codes and slugs
// ---------------------------------------------------------------------------

const SLUG_RESERVED = new Set([
  "admin", "api", "agent", "store", "stores", "login", "register", "account",
  "checkout", "cart", "orders", "help", "support", "new", "join", "nikimart",
]);

/** Normalise a store slug. Shared with the browser via lib/data-bundles/slug. */
export const normaliseSlug = normaliseSlugClient;

export function slugProblem(slug: string): string | null {
  if (slug.length < 3) return "Store link must be at least 3 characters.";
  if (slug.length > 40) return "Store link must be 40 characters or fewer.";
  if (SLUG_RESERVED.has(slug)) return "That store link is reserved. Please choose another.";
  if (!/^[a-z0-9][a-z0-9-]*[a-z0-9]$/.test(slug)) {
    return "Only letters, numbers and hyphens are allowed, and it can't start or end with a hyphen.";
  }
  return null;
}

/** Generate an unused agent code, e.g. NKM4821. */
export async function generateAgentCode(seed = ""): Promise<string> {
  const base = (seed.replace(/[^a-zA-Z]/g, "").slice(0, 3) || "NKM").toUpperCase();
  for (let i = 0; i < 20; i++) {
    const code = `${base}${Math.floor(Math.random() * 9000 + 1000)}`;
    try {
      const clash = await prisma.dataAgent.findUnique({ where: { code }, select: { id: true } });
      if (!clash) return code;
    } catch {
      return code;
    }
  }
  return `NKM${Date.now().toString(36).toUpperCase().slice(-5)}`;
}

// ---------------------------------------------------------------------------
// Pricing
// ---------------------------------------------------------------------------

/** One bundle as an agent sees it: their cost, their price, their profit. */
export interface AgentBundleRow {
  network: Network;
  sizeGb: number;
  validity: string;
  /** What NikiMart charges the agent (their cost basis). */
  agentPrice: number;
  /** NikiMart's own public retail price, for reference. */
  retailPrice: number;
  /** What this agent charges. Defaults to NikiMart's retail price. */
  price: number;
  /** price − agentPrice. */
  profit: number;
  /** Whether the agent is showing this bundle in their store. */
  isActive: boolean;
  /** True when the agent has explicitly set a price (vs. inheriting retail). */
  isCustom: boolean;
}

/**
 * The full ladder for one agent: every bundle NikiMart resells, merged with
 * whatever prices that agent has set. Bundles with no agent price (agentPrice
 * of 0) are not resold and never appear.
 */
export async function getAgentBundleRows(agentId: string): Promise<AgentBundleRow[]> {
  const [bundles, overrides] = await Promise.all([
    getActiveBundles(),
    prisma.dataAgentPrice
      .findMany({ where: { agentId } })
      .catch((): Array<{ network: string; sizeGb: number; price: number; isActive: boolean }> => []),
  ]);

  const byKey = new Map(overrides.map((o) => [`${o.network}|${o.sizeGb}`, o]));

  return bundles
    .filter((b) => b.agentPrice > 0)
    .map((b) => {
      const override = byKey.get(`${b.network}|${b.sizeGb}`);
      const price = override ? override.price : b.price;
      return {
        network: b.network,
        sizeGb: b.sizeGb,
        validity: b.validity,
        agentPrice: b.agentPrice,
        retailPrice: b.price,
        price,
        profit: round2(price - b.agentPrice),
        isActive: override ? override.isActive : true,
        isCustom: Boolean(override),
      };
    })
    .sort((a, b) => NETWORKS.indexOf(a.network) - NETWORKS.indexOf(b.network) || a.sizeGb - b.sizeGb);
}

/** What an agent's storefront actually sells: active rows only, grouped. */
export async function getAgentStorefrontGroups(
  agentId: string,
): Promise<Array<{ network: Network; bundles: AgentBundleRow[] }>> {
  const rows = (await getAgentBundleRows(agentId)).filter((r) => r.isActive && r.price > 0);
  return NETWORKS.map((network) => ({
    network,
    bundles: rows.filter((r) => r.network === network),
  })).filter((g) => g.bundles.length > 0);
}

/**
 * Re-read one row at purchase time. The browser posts network+size only, so a
 * stale storefront can never sell at a stale price.
 */
export async function findAgentSellableBundle(
  agentId: string,
  network: Network,
  sizeGb: number,
): Promise<AgentBundleRow | null> {
  const rows = await getAgentBundleRows(agentId);
  const row = rows.find((r) => r.network === network && r.sizeGb === sizeGb);
  if (!row || !row.isActive || row.price <= 0) return null;
  return row;
}

// ---------------------------------------------------------------------------
// Wallet + performance
// ---------------------------------------------------------------------------

export interface AgentWalletSummary {
  /** Current balance. Negative while the setup fee is still clearing. */
  balance: number;
  /** Commission credited to date. */
  commissionEarned: number;
  /** Commission on delivered-but-not-yet-credited orders. */
  commissionPending: number;
  /** Gross value of everything sold through this agent. */
  totalSales: number;
  /** Paid out to MoMo so far. */
  totalWithdrawn: number;
  /** Withdrawal requests still waiting on an admin. */
  pendingWithdrawals: number;
  /** How much of the setup fee is still outstanding (0 once cleared). */
  outstandingSetup: number;
  orderCount: number;
}

export async function getAgentWallet(agent: AgentAccount): Promise<AgentWalletSummary> {
  const [earned, pending, sales, withdrawn, awaiting] = await Promise.all([
    prisma.dataAgentLedger
      .aggregate({ where: { agentId: agent.id, type: "COMMISSION" }, _sum: { amount: true } })
      .catch(() => ({ _sum: { amount: 0 } })),
    prisma.dataOrder
      .aggregate({
        where: { agentId: agent.id, commissionStatus: "pending", paymentStatus: "paid" },
        _sum: { agentCommission: true },
      })
      .catch(() => ({ _sum: { agentCommission: 0 } })),
    prisma.dataOrder
      .aggregate({
        where: { agentId: agent.id, paymentStatus: "paid" },
        _sum: { price: true },
        _count: true,
      })
      .catch(() => ({ _sum: { price: 0 }, _count: 0 })),
    prisma.dataAgentWithdrawal
      .aggregate({ where: { agentId: agent.id, status: "processed" }, _sum: { amount: true } })
      .catch(() => ({ _sum: { amount: 0 } })),
    prisma.dataAgentWithdrawal
      .aggregate({ where: { agentId: agent.id, status: "pending" }, _sum: { amount: true, fee: true } })
      .catch(() => ({ _sum: { amount: 0, fee: 0 } })),
  ]);

  return {
    balance: round2(agent.balance),
    commissionEarned: round2(earned._sum.amount ?? 0),
    commissionPending: round2(pending._sum.agentCommission ?? 0),
    totalSales: round2(sales._sum.price ?? 0),
    totalWithdrawn: round2(withdrawn._sum.amount ?? 0),
    pendingWithdrawals: round2((awaiting._sum.amount ?? 0) + (awaiting._sum.fee ?? 0)),
    outstandingSetup: outstandingSetupFee(agent.balance, agent.setupFee),
    orderCount: sales._count ?? 0,
  };
}

/**
 * What an agent may withdraw right now: their balance, less anything already
 * committed to a pending withdrawal request, floored at zero.
 */
export function withdrawableFrom(wallet: AgentWalletSummary): number {
  return round2(Math.max(0, wallet.balance - wallet.pendingWithdrawals));
}

export async function getAgentLedger(agentId: string, take = 50) {
  try {
    return await prisma.dataAgentLedger.findMany({
      where: { agentId },
      orderBy: { createdAt: "desc" },
      take,
    });
  } catch {
    return [];
  }
}

export async function getAgentWithdrawals(agentId: string, take = 50) {
  try {
    return await prisma.dataAgentWithdrawal.findMany({
      where: { agentId },
      orderBy: { createdAt: "desc" },
      take,
    });
  } catch {
    return [];
  }
}

export async function getAgentOrders(agentId: string, opts: { take?: number; skip?: number; status?: string } = {}) {
  const where = {
    agentId,
    ...(opts.status && opts.status !== "all" ? { status: opts.status } : {}),
  };
  try {
    const [rows, total] = await Promise.all([
      prisma.dataOrder.findMany({
        where,
        orderBy: { createdAt: "desc" },
        take: opts.take ?? 10,
        skip: opts.skip ?? 0,
      }),
      prisma.dataOrder.count({ where }),
    ]);
    return { rows, total };
  } catch {
    return { rows: [], total: 0 };
  }
}

/** Announcements every agent sees, pinned first. */
export async function getAnnouncements(take = 30) {
  try {
    return await prisma.dataAnnouncement.findMany({
      where: { isActive: true },
      orderBy: [{ isPinned: "desc" }, { createdAt: "desc" }],
      take,
    });
  } catch {
    return [];
  }
}

/** Admin-side roster with the numbers each row needs. */
export async function listAgents() {
  try {
    const agents = await prisma.dataAgent.findMany({
      orderBy: { createdAt: "desc" },
      include: { user: { select: { name: true, email: true, phone: true } } },
    });
    const sales = await prisma.dataOrder.groupBy({
      by: ["agentId"],
      where: { agentId: { in: agents.map((a) => a.id) }, paymentStatus: "paid" },
      _sum: { price: true, agentCommission: true },
      _count: true,
    });
    const byAgent = new Map(sales.map((s) => [s.agentId, s]));
    return agents.map((a) => {
      const s = byAgent.get(a.id);
      return {
        ...a,
        totalSales: round2(s?._sum.price ?? 0),
        totalCommission: round2(s?._sum.agentCommission ?? 0),
        orderCount: s?._count ?? 0,
      };
    });
  } catch {
    return [];
  }
}

// Re-exported so server modules that already import from here don't need a
// second import just for rounding. The rule itself lives in agent-pricing.ts.
export { round2 };
