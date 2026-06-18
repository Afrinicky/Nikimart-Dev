import Link from "next/link";
import { ArrowRight } from "lucide-react";
import type { ReactNode } from "react";

export function SectionHeading({
  title,
  subtitle,
  viewAllHref,
  icon,
  extra,
}: {
  title: string;
  subtitle?: string;
  viewAllHref?: string;
  icon?: ReactNode;
  extra?: ReactNode;
}) {
  return (
    <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h2 className="flex items-center gap-2 font-display text-xl font-bold text-niki-ink sm:text-2xl">
          {icon}
          {title}
        </h2>
        {subtitle ? (
          <p className="mt-1 text-sm text-niki-ink/60">{subtitle}</p>
        ) : null}
      </div>
      <div className="flex shrink-0 items-center gap-3">
        {extra}
        {viewAllHref ? (
          <Link
            href={viewAllHref}
            className="group flex items-center gap-1 text-sm font-semibold text-niki-orange hover:text-niki-orange-light"
          >
            View all
            <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
          </Link>
        ) : null}
      </div>
    </div>
  );
}
