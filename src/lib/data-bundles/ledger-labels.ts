/**
 * What each kind of wallet movement is called, and what colour it wears.
 *
 * One map, because the agent's wallet and the admin's ledger are the same
 * events read by two different people: an agent asking "where did this come
 * from?" and an admin answering them. They drifted before — the admin console
 * printed the raw type, so a top-up read as "WALLET_TOPUP" on one screen and
 * "Wallet top-up" on the other — and a new movement type added to one was
 * simply missing from the other.
 *
 * Pure module: no server imports, so both a server page and a client island
 * can use it.
 */

export const LEDGER_TYPE_LABELS: Record<string, string> = {
  SETUP_FEE: "Setup fee",
  SETUP_FEE_PAYMENT: "Registration fee paid",
  COMMISSION: "Commission earned",
  REFERRAL_L1: "Referral reward",
  REFERRAL_L2: "Second-level referral",
  REFERRAL_FEE_SHARE: "Registration share",
  TEAM_COMMISSION: "Team commission",
  ORDER_REFUND: "Order refund",
  WALLET_TOPUP: "Wallet top-up",
  WALLET_ORDER: "Paid from wallet",
  SUBAGENT_FEE: "Sub-agent registration",
  REWARD_PAYOUT: "Reward",
  WITHDRAWAL: "Withdrawal",
  WITHDRAWAL_REVERSAL: "Withdrawal reversed",
  ADJUSTMENT: "Adjustment",
};

export const LEDGER_TYPE_TONES: Record<string, string> = {
  SETUP_FEE: "bg-niki-gold/15 text-amber-700 ring-1 ring-niki-gold/40",
  SETUP_FEE_PAYMENT: "bg-niki-gold/15 text-amber-700 ring-1 ring-niki-gold/40",
  COMMISSION: "bg-niki-success/10 text-niki-success ring-1 ring-niki-success/30",
  // Team earnings share the success tone — they are commission by another
  // route — but keep their own label so the wallet says where each one came
  // from without anybody having to read the narration.
  REFERRAL_L1: "bg-niki-success/10 text-niki-success ring-1 ring-niki-success/30",
  REFERRAL_L2: "bg-niki-success/10 text-niki-success ring-1 ring-niki-success/30",
  REFERRAL_FEE_SHARE: "bg-niki-success/10 text-niki-success ring-1 ring-niki-success/30",
  TEAM_COMMISSION: "bg-niki-success/10 text-niki-success ring-1 ring-niki-success/30",
  // Money coming back or going in is neither earnings nor a payout — it gets
  // the neutral blues, so the wallet never reads a refund or a top-up as a sale.
  ORDER_REFUND: "bg-sky-50 text-sky-700 ring-1 ring-sky-200",
  WALLET_TOPUP: "bg-niki-trust/10 text-niki-trust ring-1 ring-niki-trust/30",
  WALLET_ORDER: "bg-niki-ink/10 text-niki-ink/70 ring-1 ring-niki-ink/20",
  SUBAGENT_FEE: "bg-niki-ink/10 text-niki-ink/70 ring-1 ring-niki-ink/20",
  // A reward is points turned into cedis, so it gets the gold of the
  // leaderboard rather than the green of a commission.
  REWARD_PAYOUT: "bg-niki-gold/15 text-amber-700 ring-1 ring-niki-gold/40",
  WITHDRAWAL: "bg-niki-trust/10 text-niki-trust ring-1 ring-niki-trust/30",
  WITHDRAWAL_REVERSAL: "bg-niki-ink/10 text-niki-ink/70 ring-1 ring-niki-ink/20",
  ADJUSTMENT: "bg-niki-ink/10 text-niki-ink/70 ring-1 ring-niki-ink/20",
};

/** A movement type in words. Unknown types read as themselves, never blank. */
export function ledgerTypeLabel(type: string): string {
  return LEDGER_TYPE_LABELS[type] ?? type.replace(/_/g, " ").toLowerCase();
}

export function ledgerTypeTone(type: string): string {
  return LEDGER_TYPE_TONES[type] ?? "bg-niki-ink/10 text-niki-ink/70 ring-1 ring-niki-ink/20";
}
