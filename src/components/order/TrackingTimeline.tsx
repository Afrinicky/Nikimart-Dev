import { Check, Circle } from "lucide-react";
import { buildTimeline, type DeliveryMethod, type ShipmentTimestamps } from "@/lib/tracking";

export function TrackingTimeline({
  timestamps,
  method,
}: {
  timestamps: ShipmentTimestamps;
  method: DeliveryMethod;
}) {
  const steps = buildTimeline(timestamps, method);

  return (
    <ol className="relative ml-3 border-l-2 border-black/5">
      {steps.map((step) => (
        <li key={step.stage} className="relative mb-6 pl-6 last:mb-0">
          <span
            className={`absolute -left-[11px] flex h-5 w-5 items-center justify-center rounded-full ring-4 ring-white ${
              step.done ? "bg-niki-success text-white" : "bg-niki-surface text-niki-ink/30"
            }`}
          >
            {step.done ? <Check className="h-3 w-3" /> : <Circle className="h-2 w-2" />}
          </span>
          <p className={`text-sm font-semibold ${step.current ? "text-niki-orange" : step.done ? "text-niki-ink" : "text-niki-ink/50"}`}>
            {step.label}
            {step.current ? <span className="ml-2 text-xs font-medium text-niki-orange">Current</span> : null}
          </p>
          <p className="mt-0.5 text-xs text-niki-ink/50">
            {step.at
              ? step.at.toLocaleString("en-GH", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })
              : `Awaiting ${step.role.toLowerCase()} confirmation`}
          </p>
        </li>
      ))}
    </ol>
  );
}
