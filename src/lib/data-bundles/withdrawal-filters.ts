/**
 * What the withdrawals table can be filtered by.
 *
 * A pure module for the same reason the orders one is: the read and the client
 * dropdown both import it, so what is offered and what is queried can never
 * drift apart.
 */

export interface WithdrawalStatusFilter {
  value: string;
  label: string;
  statuses: string[];
}

export const WITHDRAWAL_STATUS_FILTERS: WithdrawalStatusFilter[] = [
  { value: "all", label: "All status", statuses: [] },
  { value: "pending", label: "Waiting to be sent", statuses: ["pending"] },
  { value: "processed", label: "Sent", statuses: ["processed"] },
  { value: "rejected", label: "Rejected", statuses: ["rejected"] },
];

export const WITHDRAWAL_STATUS_OPTIONS = WITHDRAWAL_STATUS_FILTERS.map(({ value, label }) => ({
  value,
  label,
}));

/** The MoMo networks a payout can go to, as the request form records them. */
export const WITHDRAWAL_NETWORK_OPTIONS = [
  { value: "all", label: "All networks" },
  { value: "MTN", label: "MTN MoMo" },
  { value: "TELECEL", label: "Telecel Cash" },
  { value: "AIRTELTIGO", label: "AirtelTigo Money" },
];

export function withdrawalStatusFilter(value: string | undefined | null): WithdrawalStatusFilter {
  return WITHDRAWAL_STATUS_FILTERS.find((f) => f.value === value) ?? WITHDRAWAL_STATUS_FILTERS[0];
}

export function withdrawalStatusWhere(value: string | undefined | null) {
  const filter = withdrawalStatusFilter(value);
  if (filter.statuses.length === 0) return {};
  return { status: { in: filter.statuses } };
}

export function withdrawalNetworkWhere(value: string | undefined | null) {
  const network = WITHDRAWAL_NETWORK_OPTIONS.find((n) => n.value === value && n.value !== "all");
  return network ? { momoNetwork: network.value } : {};
}

/**
 * The one search box: the number the money is going to, the name on the
 * account, or the agent's store or code. Everything somebody has in hand when
 * they are chasing a payout.
 */
export function withdrawalSearchWhere(query: string | undefined | null) {
  const term = (query ?? "").trim();
  if (!term) return {};
  const digits = term.replace(/\D/g, "");
  return {
    OR: [
      { momoName: { contains: term, mode: "insensitive" as const } },
      ...(digits ? [{ momoPhone: { contains: digits } }] : []),
      { agent: { storeName: { contains: term, mode: "insensitive" as const } } },
      { agent: { code: { contains: term.toUpperCase() } } },
    ],
  };
}
