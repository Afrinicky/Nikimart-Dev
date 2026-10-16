import { FULFILMENT_TONES, stageLabelFor, type FulfilmentStage } from "@/lib/retail/fulfilment";
import { cn } from "@/lib/cn";

/**
 * Where an order is, as a pill.
 *
 * Worded for the order it sits on: "Collected by buyer" on a pickup and
 * "Delivered" on a courier run are the same stage, and calling both by one
 * name is how an admin ends up telling somebody to come and fetch a parcel
 * that was dropped at their door.
 */
export function StagePill({
  stage,
  method = "delivery",
  route = "domestic",
  className,
}: {
  stage: FulfilmentStage;
  method?: "delivery" | "pickup";
  route?: "domestic" | "abroad";
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex whitespace-nowrap rounded-full px-2.5 py-1 text-[11px] font-semibold",
        FULFILMENT_TONES[stage],
        className,
      )}
    >
      {stageLabelFor(stage, method, route)}
    </span>
  );
}

/** Paid in full, part paid, or nothing yet — the other half of a row. */
export function PaymentPill({
  total,
  amountPaid,
  balanceDue,
}: {
  total: number;
  amountPaid: number;
  balanceDue: number;
}) {
  const state =
    amountPaid <= 0 ? "unpaid" : balanceDue > 0 ? "part" : total <= 0 ? "free" : "paid";
  const tone = {
    unpaid: "bg-niki-danger/10 text-niki-danger ring-1 ring-niki-danger/25",
    part: "bg-niki-gold/20 text-amber-900 ring-1 ring-niki-gold/30",
    paid: "bg-niki-success/10 text-niki-success ring-1 ring-niki-success/30",
    free: "bg-niki-ink/5 text-niki-ink/60 ring-1 ring-niki-edge",
  }[state];
  const label = { unpaid: "Unpaid", part: "Balance due", paid: "Paid", free: "No charge" }[state];

  return (
    <span
      className={cn(
        "inline-flex whitespace-nowrap rounded-full px-2.5 py-1 text-[11px] font-semibold",
        tone,
      )}
    >
      {label}
    </span>
  );
}
