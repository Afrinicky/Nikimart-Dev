import Link from "next/link";
import { ArrowUpRight } from "lucide-react";

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
      <p className="font-display text-2xl font-bold text-niki-ink">{value}</p>
      <p className="mt-1 flex items-center gap-1 text-sm text-niki-ink/60">
        {label}
        {href ? (
          <ArrowUpRight className="h-3.5 w-3.5 opacity-0 transition-opacity group-hover:opacity-100" />
        ) : null}
      </p>
    </>
  );

  if (!href) {
    return <div className="rounded-2xl bg-white p-5 ring-1 ring-black/5">{body}</div>;
  }

  return (
    <Link
      href={href}
      className="group rounded-2xl bg-white p-5 ring-1 ring-black/5 transition-all hover:-translate-y-0.5 hover:shadow-lg hover:shadow-niki-navy/5"
    >
      {body}
    </Link>
  );
}
