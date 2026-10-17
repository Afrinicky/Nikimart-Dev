import type { ElementType } from "react";
import { ActionLink } from "@/components/ui/motion";

/**
 * One headline number, as a link to the rows behind it.
 *
 * Matching the tiles on the orders tab exactly, because the two screens sit
 * side by side under one module and a number that looks different reads as a
 * different kind of number.
 */
export function StatTile({
  label,
  value,
  hint,
  href,
  icon: Icon,
  tone = "ink",
}: {
  label: string;
  value: string;
  hint?: string;
  href: string;
  icon: ElementType;
  tone?: "ink" | "success" | "danger" | "orange";
}) {
  const tones = {
    ink: "text-niki-ink",
    success: "text-niki-success",
    danger: "text-niki-danger",
    orange: "text-niki-orange",
  } as const;

  return (
    <ActionLink
      href={href}
      className="niki-focus group block rounded-2xl bg-white p-3.5 ring-1 ring-niki-edge transition-colors hover:ring-niki-orange/50 sm:p-5"
    >
      <div className="flex items-center gap-1.5 text-niki-ink/50 sm:gap-2">
        <Icon className="h-3.5 w-3.5 shrink-0 sm:h-4 sm:w-4" />
        <span className="truncate text-[10px] font-semibold uppercase tracking-wide sm:text-xs">
          {label}
        </span>
      </div>
      <p className={`mt-1.5 font-figures text-lg font-bold sm:mt-2 sm:text-2xl ${tones[tone]}`}>
        {value}
      </p>
      {hint ? <p className="mt-0.5 text-[11px] text-niki-ink/50 sm:text-xs">{hint}</p> : null}
    </ActionLink>
  );
}
