// Presentation helpers for order and shipment statuses.

export const ORDER_STATUS_LABELS: Record<string, string> = {
  pending: "Pending payment",
  paid: "Paid",
  shipped: "Shipped",
  delivered: "Delivered",
  cancelled: "Cancelled",
};

export const SHIPMENT_STATUS_LABELS: Record<string, string> = {
  created: "Awaiting confirmation",
  processing: "Prepared by seller",
  // Only reached by a consignment shipped from abroad.
  at_forwarder: "At the freight forwarder",
  in_transit: "In transit",
  arrived_ghana: "Arrived in Ghana",
  out_for_delivery: "Out for delivery",
  delivered: "Delivered",
};

// Tailwind classes for a status pill, keyed by status string.
export function statusTone(status: string): string {
  switch (status) {
    case "delivered":
      return "bg-niki-success/10 text-niki-success";
    case "shipped":
    case "in_transit":
    case "arrived_ghana":
    case "out_for_delivery":
      return "bg-niki-trust/10 text-niki-trust";
    case "at_forwarder":
      return "bg-niki-gold/15 text-amber-800";
    case "paid":
      return "bg-niki-orange/10 text-niki-orange";
    case "cancelled":
      return "bg-niki-danger/10 text-niki-danger";
    default:
      return "bg-niki-ink/10 text-niki-ink/70";
  }
}
