import {
  DATA_ORDER_STATUSES,
  NETWORK_LIST,
  type DataOrderStatus,
} from "@/lib/data-bundles/networks";

/**
 * What the orders table can be filtered by, in one place for both consoles.
 *
 * The dropdown is not the raw status list. "Paid" and "processing" are two
 * internal steps of the same thing — money in, bundle on its way — and an
 * agent picking between two options both reading PROCESSING would be choosing
 * blind. So a filter names a state somebody recognises and covers whichever
 * statuses belong to it. Pure module: the reads and the client dropdown both
 * import it, so what is offered and what is queried can never drift apart.
 */

export interface OrderStatusFilter {
  value: string;
  label: string;
  statuses: DataOrderStatus[];
}

export const ORDER_STATUS_FILTERS: OrderStatusFilter[] = [
  { value: "all", label: "All Status", statuses: [] },
  { value: "pending", label: "Awaiting payment", statuses: ["pending"] },
  { value: "queued", label: "Queued", statuses: ["queued"] },
  { value: "processing", label: "Processing", statuses: ["paid", "processing"] },
  { value: "completed", label: "Delivered", statuses: ["completed"] },
  { value: "failed", label: "Failed", statuses: ["failed"] },
  { value: "refunded", label: "Cancelled & refunded", statuses: ["refunded"] },
];

export const ORDER_STATUS_OPTIONS = ORDER_STATUS_FILTERS.map(({ value, label }) => ({
  value,
  label,
}));

export const ORDER_NETWORK_OPTIONS = [
  { value: "all", label: "All Networks" },
  ...NETWORK_LIST.map((n) => ({ value: n.value, label: n.label })),
];

/** The filter a `?status=` value names, falling back to "all". */
export function orderStatusFilter(value: string | undefined | null): OrderStatusFilter {
  return ORDER_STATUS_FILTERS.find((f) => f.value === value) ?? ORDER_STATUS_FILTERS[0];
}

/** The `where` fragment for a `?status=` value. Empty object means "all". */
export function orderStatusWhere(value: string | undefined | null) {
  const filter = orderStatusFilter(value);
  if (filter.statuses.length === 0) return {};
  if (filter.statuses.length === 1) return { status: filter.statuses[0] };
  return { status: { in: filter.statuses } };
}

/** The `where` fragment for a `?network=` value. Empty object means "all". */
export function orderNetworkWhere(value: string | undefined | null) {
  const network = ORDER_NETWORK_OPTIONS.find((n) => n.value === value && n.value !== "all");
  return network ? { network: network.value } : {};
}

/**
 * The `where` fragment for the one search box: the reference somebody was
 * given, or the number a bundle was sent to.
 */
export function orderSearchWhere(query: string | undefined | null) {
  const term = (query ?? "").trim();
  if (!term) return {};
  const digits = term.replace(/\D/g, "");
  return {
    OR: [
      { reference: { contains: term.toUpperCase() } },
      ...(digits
        ? [{ recipientPhone: { contains: digits } }, { buyerPhone: { contains: digits } }]
        : []),
    ],
  };
}

/** Rows per page, clamped to the options the pager actually offers. */
export function perPageFrom(value: string | undefined | null, fallback = 10): number {
  const n = Number(value);
  return [10, 25, 50, 100].includes(n) ? n : fallback;
}

/** Every status this filter covers, for an export that must match the table. */
export { DATA_ORDER_STATUSES };
