import "server-only";
import { dataDb } from "@/lib/data-db";
import { getAgentUsers } from "@/lib/data-bundles/user-link";
import { bundleLabel, networkLabel } from "@/lib/data-bundles/networks";
import { ledgerTypeLabel } from "@/lib/data-bundles/ledger-labels";
import { round2 } from "@/lib/data-bundles/agent-pricing";
import { DATA_STATUS_LABELS, isDataOrderStatus } from "@/lib/data-bundles/networks";
import type { CellValue, Sheet } from "@/lib/xlsx";

/**
 * Workbooks for Admin → Data → Store settings → Export.
 *
 * This is the other half of the pair the backup feature kept insisting it was
 * not. A backup is for putting the database back; an export is for answering a
 * question in a spreadsheet — what did we pay in commission last quarter, which
 * agents are owed a withdrawal, how much did AFA actually bring in. The two
 * have opposite priorities, which is why they are different code: a backup
 * must be exact and machine-readable and is useless to a bookkeeper, and an
 * export resolves ids to names, spells statuses out in English, and is useless
 * for a restore.
 *
 * Every read goes through `dataDb`. The retail database holds the accounts
 * agents sign in with, so an agent's name and email are fetched from it by
 * `getAgentUsers` — one query for a whole sheet, not one per row — and nothing
 * else crosses.
 *
 * Nothing here exports a credential. Password hashes, setup-token hashes and
 * the provider's own identifiers are deliberately left out: a spreadsheet gets
 * emailed to an accountant, and the columns are chosen on that assumption.
 */

export const DATA_EXPORT_DATASETS = [
  "agents",
  "orders",
  "afa",
  "ledger",
  "withdrawals",
  "topups",
  "referrals",
  "bundles",
  "applications",
  "support",
] as const;

export type DataExportDataset = (typeof DATA_EXPORT_DATASETS)[number];

export function isDataExportDataset(value: string): value is DataExportDataset {
  return (DATA_EXPORT_DATASETS as readonly string[]).includes(value);
}

export interface DataExportInfo {
  dataset: DataExportDataset;
  title: string;
  description: string;
  /** What the workbook's sheets are called, for the console's listing. */
  sheets: string[];
}

export const DATA_EXPORT_INFO: Record<DataExportDataset, DataExportInfo> = {
  agents: {
    dataset: "agents",
    title: "Agents",
    description:
      "Every agent account with its store, status, wallet balance, registration settlement and who recruited them.",
    sheets: ["Agents"],
  },
  orders: {
    dataset: "orders",
    title: "Bundle orders",
    description:
      "Every bundle order: what was sold, to whom, what it cost us, what the agent earned and whether it was delivered.",
    sheets: ["Orders"],
  },
  afa: {
    dataset: "afa",
    title: "AFA registrations",
    description: "Registrations sold, their status with the provider, and the commission they paid.",
    sheets: ["AFA registrations"],
  },
  ledger: {
    dataset: "ledger",
    title: "Agent ledger",
    description:
      "Every movement in every agent wallet, with the running balance — the book behind the balances.",
    sheets: ["Ledger"],
  },
  withdrawals: {
    dataset: "withdrawals",
    title: "Withdrawals",
    description: "Payout requests, their fees, the mobile money account paid and who processed them.",
    sheets: ["Withdrawals"],
  },
  topups: {
    dataset: "topups",
    title: "Wallet top-ups",
    description: "Money agents put into their wallets, and what was credited after fees.",
    sheets: ["Top-ups"],
  },
  referrals: {
    dataset: "referrals",
    title: "Referrals",
    description:
      "Who recruited whom, and every referral reward and team commission the ledger has paid.",
    sheets: ["Network", "Rewards paid"],
  },
  bundles: {
    dataset: "bundles",
    title: "Bundle prices",
    description: "The price ladder — cost, retail and agent price — and every agent's own override.",
    sheets: ["Bundles", "Agent prices"],
  },
  applications: {
    dataset: "applications",
    title: "Agent applications",
    description: "Applications to join the programme, their decision and how the fee was settled.",
    sheets: ["Applications"],
  },
  support: {
    dataset: "support",
    title: "Support requests",
    description: "Requests agents have raised, and how they were answered.",
    sheets: ["Support"],
  },
};

export const DATA_EXPORT_LIST: DataExportInfo[] = DATA_EXPORT_DATASETS.map(
  (d) => DATA_EXPORT_INFO[d],
);

/**
 * A ceiling on rows per sheet. An export is a spreadsheet somebody opens, not
 * an archive — past this the answer is a backup or a database query, and
 * silently truncating is worse than saying so, which the console does.
 */
const ROW_LIMIT = 50_000;

// ---------------------------------------------------------------------------

/** Agent id → a readable label, for sheets that reference agents by id. */
async function agentLookup(): Promise<Map<string, { label: string; email: string }>> {
  const agents = await dataDb.dataAgent.findMany({
    select: { id: true, code: true, storeName: true, userId: true },
  });
  const users = await getAgentUsers(agents.map((a) => a.userId));
  return new Map(
    agents.map((a) => {
      const user = users.get(a.userId);
      return [
        a.id,
        {
          label: `${a.code} — ${user?.name || a.storeName || "Unnamed"}`,
          email: user?.email ?? "",
        },
      ];
    }),
  );
}

export async function buildDataExport(dataset: DataExportDataset): Promise<Sheet[]> {
  switch (dataset) {
    case "agents":
      return agentsSheets();
    case "orders":
      return ordersSheets();
    case "afa":
      return afaSheets();
    case "ledger":
      return ledgerSheets();
    case "withdrawals":
      return withdrawalsSheets();
    case "topups":
      return topupsSheets();
    case "referrals":
      return referralsSheets();
    case "bundles":
      return bundlesSheets();
    case "applications":
      return applicationsSheets();
    case "support":
      return supportSheets();
  }
}

// --- Agents ----------------------------------------------------------------

async function agentsSheets(): Promise<Sheet[]> {
  const agents = await dataDb.dataAgent.findMany({
    orderBy: { createdAt: "desc" },
    take: ROW_LIMIT,
    include: { referredBy: { select: { code: true, storeName: true } } },
  });
  const users = await getAgentUsers(agents.map((a) => a.userId));

  return [
    {
      name: "Agents",
      columns: [
        "Code", "Name", "Email", "Store name", "Store link", "Status", "Store open",
        "Wallet balance (GH₵)", "Setup fee (GH₵)", "Fee method", "Fee paid",
        "AFA price (GH₵)", "AFA on sale", "Support phone", "Recruited by", "Joined",
      ],
      rows: agents.map((a): CellValue[] => {
        const user = users.get(a.userId);
        return [
          a.code,
          user?.name ?? "",
          user?.email ?? "",
          a.storeName,
          `/store/${a.slug}`,
          a.status,
          a.storeOpen,
          a.balance,
          a.setupFee,
          a.setupFeeMethod,
          a.setupFeePaidAt,
          a.afaPrice,
          a.afaEnabled,
          a.supportPhone,
          a.referredBy ? `${a.referredBy.code} — ${a.referredBy.storeName}` : "",
          a.createdAt,
        ];
      }),
    },
  ];
}

// --- Orders ----------------------------------------------------------------

async function ordersSheets(): Promise<Sheet[]> {
  const orders = await dataDb.dataOrder.findMany({
    orderBy: { createdAt: "desc" },
    take: ROW_LIMIT,
  });
  const agents = await agentLookup();

  return [
    {
      name: "Orders",
      columns: [
        "Reference", "Placed", "Network", "Bundle", "Price (GH₵)", "Our cost (GH₵)",
        "Margin (GH₵)", "Status", "Payment", "Paid at", "Recipient", "Buyer phone",
        "Buyer name", "Buyer email", "Source", "Agent", "Agent cost (GH₵)",
        "Agent commission (GH₵)", "Commission status", "Commission paid",
        "Team agent", "Team commission (GH₵)", "Team status",
        "Dispatched", "Completed", "Refunded",
      ],
      rows: orders.map((o): CellValue[] => {
        // The provider's cost when it told us one, otherwise the price we
        // expected to pay — the accounting question is what it cost, not which
        // of the two numbers answered it.
        const cost = o.providerCost ?? o.costPrice;
        return [
          o.reference,
          o.createdAt,
          networkLabel(o.network),
          bundleLabel(o.sizeGb),
          o.price,
          cost,
          round2(o.price - cost),
          isDataOrderStatus(o.status) ? DATA_STATUS_LABELS[o.status] : o.status,
          o.paymentStatus,
          o.paidAt,
          o.recipientPhone,
          o.buyerPhone,
          o.buyerName ?? "",
          o.buyerEmail ?? "",
          o.source,
          o.agentId ? (agents.get(o.agentId)?.label ?? o.agentId) : "",
          o.agentCost,
          o.agentCommission,
          o.commissionStatus,
          o.commissionPaidAt,
          o.teamAgentId ? (agents.get(o.teamAgentId)?.label ?? o.teamAgentId) : "",
          o.teamCommission,
          o.teamCommissionStatus,
          o.dispatchedAt,
          o.completedAt,
          o.refundedAt,
        ];
      }),
    },
  ];
}

// --- AFA -------------------------------------------------------------------

async function afaSheets(): Promise<Sheet[]> {
  const rows = await dataDb.afaRegistration.findMany({
    orderBy: { createdAt: "desc" },
    take: ROW_LIMIT,
  });
  const agents = await agentLookup();

  return [
    {
      name: "AFA registrations",
      columns: [
        "Reference", "Submitted", "Full name", "Phone", "ID number", "Date of birth",
        "Town", "Occupation", "Price (GH₵)", "Status", "Payment", "Paid at",
        "Provider status", "Source", "Agent", "Agent cost (GH₵)",
        "Agent commission (GH₵)", "Commission status", "Team agent",
        "Team commission (GH₵)", "Dispatched", "Completed",
      ],
      rows: rows.map((r): CellValue[] => [
        r.reference,
        r.createdAt,
        r.fullName,
        r.phoneNumber,
        r.idNumber,
        r.dateOfBirth,
        r.town,
        r.occupation,
        r.price,
        r.status,
        r.paymentStatus,
        r.paidAt,
        r.providerStatus ?? "",
        r.source,
        r.agentId ? (agents.get(r.agentId)?.label ?? r.agentId) : "",
        r.agentCost,
        r.agentCommission,
        r.commissionStatus,
        r.teamAgentId ? (agents.get(r.teamAgentId)?.label ?? r.teamAgentId) : "",
        r.teamCommission,
        r.dispatchedAt,
        r.completedAt,
      ]),
    },
  ];
}

// --- Ledger ----------------------------------------------------------------

async function ledgerSheets(): Promise<Sheet[]> {
  const entries = await dataDb.dataAgentLedger.findMany({
    orderBy: { createdAt: "desc" },
    take: ROW_LIMIT,
  });
  const agents = await agentLookup();

  return [
    {
      name: "Ledger",
      columns: [
        "When", "Agent", "Agent email", "Type", "Amount (GH₵)", "Balance after (GH₵)",
        "Narration", "Reference", "From agent", "Referral level",
      ],
      rows: entries.map((e): CellValue[] => [
        e.createdAt,
        e.agentId ? (agents.get(e.agentId)?.label ?? e.agentId) : "",
        e.agentId ? (agents.get(e.agentId)?.email ?? "") : "",
        ledgerTypeLabel(e.type),
        e.amount,
        e.balanceAfter,
        e.narration,
        e.reference ?? "",
        e.sourceAgentId ? (agents.get(e.sourceAgentId)?.label ?? e.sourceAgentId) : "",
        e.referralLevel ?? "",
      ]),
    },
  ];
}

// --- Withdrawals -----------------------------------------------------------

async function withdrawalsSheets(): Promise<Sheet[]> {
  const rows = await dataDb.dataAgentWithdrawal.findMany({
    orderBy: { createdAt: "desc" },
    take: ROW_LIMIT,
  });
  const agents = await agentLookup();

  return [
    {
      name: "Withdrawals",
      columns: [
        "Requested", "Agent", "Agent email", "Amount (GH₵)", "Fee (GH₵)",
        "Paid out (GH₵)", "Status", "MoMo name", "MoMo phone", "MoMo network",
        "Processed", "Processed by", "Admin note",
      ],
      rows: rows.map((w): CellValue[] => [
        w.createdAt,
        agents.get(w.agentId)?.label ?? w.agentId,
        agents.get(w.agentId)?.email ?? "",
        w.amount,
        w.fee,
        round2(w.amount - w.fee),
        w.status,
        w.momoName,
        w.momoPhone,
        w.momoNetwork,
        w.processedAt,
        w.processedBy ?? "",
        w.adminNote,
      ]),
    },
  ];
}

// --- Top-ups ---------------------------------------------------------------

async function topupsSheets(): Promise<Sheet[]> {
  const rows = await dataDb.dataWalletTopup.findMany({
    orderBy: { createdAt: "desc" },
    take: ROW_LIMIT,
  });
  const agents = await agentLookup();

  return [
    {
      name: "Top-ups",
      columns: [
        "Requested", "Reference", "Agent", "Agent email", "Amount (GH₵)",
        "Credited (GH₵)", "Status", "Paid at",
      ],
      rows: rows.map((t): CellValue[] => [
        t.createdAt,
        t.reference,
        agents.get(t.agentId)?.label ?? t.agentId,
        agents.get(t.agentId)?.email ?? "",
        t.amount,
        t.creditedAmount,
        t.status,
        t.paidAt,
      ]),
    },
  ];
}

// --- Referrals -------------------------------------------------------------

/**
 * Two sheets, because "who recruited whom" and "what that has cost" are two
 * different questions and nobody wants to pivot one into the other.
 */
async function referralsSheets(): Promise<Sheet[]> {
  const agents = await dataDb.dataAgent.findMany({
    where: { referredById: { not: null } },
    orderBy: { createdAt: "desc" },
    take: ROW_LIMIT,
    include: { referredBy: { select: { code: true, storeName: true, userId: true } } },
  });
  const users = await getAgentUsers([
    ...agents.map((a) => a.userId),
    ...agents.map((a) => a.referredBy?.userId).filter((id): id is string => Boolean(id)),
  ]);

  // Referral rewards and team commission are ledger entries; reading them from
  // the ledger means the sheet and the agent's balance can never disagree.
  const rewards = await dataDb.dataAgentLedger.findMany({
    where: { type: { in: ["referral_reward", "team_commission"] } },
    orderBy: { createdAt: "desc" },
    take: ROW_LIMIT,
  });
  const lookup = await agentLookup();

  return [
    {
      name: "Network",
      columns: [
        "Agent", "Agent email", "Store", "Status", "Recruited by",
        "Recruiter email", "Joined",
      ],
      rows: agents.map((a): CellValue[] => [
        a.code,
        users.get(a.userId)?.email ?? "",
        a.storeName,
        a.status,
        a.referredBy ? `${a.referredBy.code} — ${a.referredBy.storeName}` : "",
        a.referredBy ? (users.get(a.referredBy.userId)?.email ?? "") : "",
        a.createdAt,
      ]),
    },
    {
      name: "Rewards paid",
      columns: [
        "When", "Paid to", "Email", "Type", "Amount (GH₵)", "Level", "Earned from",
        "Narration",
      ],
      rows: rewards.map((r): CellValue[] => [
        r.createdAt,
        lookup.get(r.agentId)?.label ?? r.agentId,
        lookup.get(r.agentId)?.email ?? "",
        ledgerTypeLabel(r.type),
        r.amount,
        r.referralLevel ?? "",
        r.sourceAgentId ? (lookup.get(r.sourceAgentId)?.label ?? r.sourceAgentId) : "",
        r.narration,
      ]),
    },
  ];
}

// --- Bundles ---------------------------------------------------------------

async function bundlesSheets(): Promise<Sheet[]> {
  const bundles = await dataDb.dataBundle.findMany({
    orderBy: [{ network: "asc" }, { sizeGb: "asc" }],
    take: ROW_LIMIT,
  });
  const prices = await dataDb.dataAgentPrice.findMany({
    orderBy: [{ network: "asc" }, { sizeGb: "asc" }],
    take: ROW_LIMIT,
  });
  const agents = await agentLookup();

  return [
    {
      name: "Bundles",
      columns: [
        "Network", "Bundle", "Validity", "Cost (GH₵)", "Retail price (GH₵)",
        "Agent price (GH₵)", "Retail margin (GH₵)", "Agent margin (GH₵)",
        "On sale", "Team commission (GH₵)",
      ],
      rows: bundles.map((b): CellValue[] => [
        networkLabel(b.network),
        bundleLabel(b.sizeGb),
        b.validity,
        b.costPrice,
        b.price,
        b.agentPrice,
        round2(b.price - b.costPrice),
        round2(b.agentPrice - b.costPrice),
        b.isActive,
        b.teamCommission,
      ]),
    },
    {
      name: "Agent prices",
      columns: ["Agent", "Network", "Bundle", "Their price (GH₵)", "On sale"],
      rows: prices.map((p): CellValue[] => [
        agents.get(p.agentId)?.label ?? p.agentId,
        networkLabel(p.network),
        bundleLabel(p.sizeGb),
        p.price,
        p.isActive,
      ]),
    },
  ];
}

// --- Applications ----------------------------------------------------------

async function applicationsSheets(): Promise<Sheet[]> {
  const rows = await dataDb.dataAgentApplication.findMany({
    orderBy: { createdAt: "desc" },
    take: ROW_LIMIT,
  });

  return [
    {
      name: "Applications",
      columns: [
        "Applied", "Full name", "Phone", "Email", "Store name", "Desired link",
        "Status", "Fee charged (GH₵)", "Fee before waiver (GH₵)", "Waiver (%)",
        "Waived (GH₵)", "Recruiter share (GH₵)", "Fee method", "Payment",
        "Fee paid", "Referral code", "Invite code", "Reviewed", "Reviewed by",
        "Applicant note", "Admin note",
      ],
      rows: rows.map((a): CellValue[] => [
        a.createdAt,
        a.fullName || `${a.firstName} ${a.lastName}`.trim(),
        a.phone,
        a.email,
        a.storeName,
        a.desiredSlug,
        a.status,
        a.feeAmount,
        a.feeGross,
        a.feeWaiverPercent,
        a.feeWaived,
        a.feeReferrerShare,
        a.feeMethod,
        a.paymentStatus,
        a.feePaidAt,
        a.referralCode,
        a.inviteCode,
        a.reviewedAt,
        a.reviewedBy ?? "",
        a.note,
        a.adminNote,
      ]),
    },
  ];
}

// --- Support ---------------------------------------------------------------

async function supportSheets(): Promise<Sheet[]> {
  const rows = await dataDb.dataSupportRequest.findMany({
    orderBy: { createdAt: "desc" },
    take: ROW_LIMIT,
  });
  const agents = await agentLookup();

  return [
    {
      name: "Support",
      columns: [
        "Raised", "Agent", "Agent email", "Name given", "Phone", "Language",
        "Message", "Status", "Resolved", "Admin note",
      ],
      rows: rows.map((r): CellValue[] => [
        r.createdAt,
        r.agentId ? (agents.get(r.agentId)?.label ?? r.agentId) : "",
        r.agentId ? (agents.get(r.agentId)?.email ?? "") : "",
        r.fullName,
        r.phone,
        r.language,
        r.message,
        r.status,
        r.resolvedAt,
        r.adminNote,
      ]),
    },
  ];
}
