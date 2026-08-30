import { ArrowUpRight } from "lucide-react";
import { ActionLink } from "@/components/ui/motion";

/**
 * A dashboard metric. Pass `href` and the whole tile becomes a link to wherever
 * the number comes from, with an affordance on hover — a metric you can't drill
 * into is a dead end.
 */
export function StatCard({
  label,
  value,
  href,
}: {
  label: string;
  value: string | number;
  href?: string;
}) {
  const body = (
    <>
      <p className="font-figures text-2xl font-bold text-niki-ink">{value}</p>
      <p className="mt-1 flex items-center gap-1 text-sm text-niki-ink/60">
        {label}
        {href ? (
          <ArrowUpRight className="h-3.5 w-3.5 opacity-0 transition-opacity group-hover:opacity-100" />
        ) : null}
      </p>
    </>
  );

  if (!href) {
    return <div className="rounded-2xl bg-white p-5 ring-1 ring-niki-edge">{body}</div>;
  }

  return (
    <ActionLink
      href={href}
      className="group niki-lift block rounded-2xl bg-white p-5 ring-1 ring-niki-edge hover:shadow-lg hover:shadow-niki-black/5"
    >
      {body}
    </ActionLink>
  );
}
