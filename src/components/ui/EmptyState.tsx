import type { ReactNode } from "react";
import Link from "next/link";

export function EmptyState({
  icon,
  title,
  message,
  actionLabel,
  actionHref,
}: {
  icon?: ReactNode;
  title: string;
  message?: string;
  actionLabel?: string;
  actionHref?: string;
}) {
  return (
    <div className="flex flex-col items-center justify-center rounded-2xl bg-white px-6 py-16 text-center ring-1 ring-black/5">
      {icon ? (
        <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-niki-surface text-niki-orange">
          {icon}
        </div>
      ) : null}
      <h2 className="font-display text-lg font-bold text-niki-ink">{title}</h2>
      {message ? <p className="mt-2 max-w-md text-sm text-niki-ink/60">{message}</p> : null}
      {actionLabel && actionHref ? (
        <Link
          href={actionHref}
          className="mt-6 inline-flex items-center gap-2 rounded-full bg-niki-orange px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-niki-orange-light"
        >
          {actionLabel}
        </Link>
      ) : null}
    </div>
  );
}
