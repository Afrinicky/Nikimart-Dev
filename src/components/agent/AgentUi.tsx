import type { ReactNode } from "react";
import { ActionLink } from "@/components/ui/motion";
import { cn } from "@/lib/cn";
import {
  DATA_STATUS_LABELS,
  DATA_STATUS_TONES,
  isDataOrderStatus,
} from "@/lib/data-bundles/networks";

/**
 * The furniture every agent screen shares: a page title, a card, a status pill
 * and a table pager. Kept here so the eight screens stay consistent without
 * eight copies of the same markup.
 */

export function AgentPageHeading({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children?: ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="font-display text-2xl font-bold text-niki-ink">{title}</h1>
        {subtitle ? <p className="mt-1 text-sm text-niki-ink/60">{subtitle}</p> : null}
      </div>
      {children ? <div className="flex shrink-0 flex-wrap gap-2">{children}</div> : null}
    </div>
  );
}

export function Card({
  title,
  description,
  icon: Icon,
  children,
  action,
  className,
}: {
  title?: string;
  description?: string;
  icon?: React.ElementType;
  children: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <section className={cn("rounded-2xl bg-white p-5 ring-1 ring-niki-edge", className)}>
      {title ? (
        <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
          <div className="flex items-center gap-2.5">
            {Icon ? (
              <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-niki-orange/10 text-niki-orange">
                <Icon className="h-4.5 w-4.5" />
              </span>
            ) : null}
            <div>
              <h2 className="font-display font-bold text-niki-ink">{title}</h2>
              {description ? <p className="text-xs text-niki-ink/55">{description}</p> : null}
            </div>
          </div>
          {action ? <div className="shrink-0">{action}</div> : null}
        </div>
      ) : null}
      {children}
    </section>
  );
}

export function StatusPill({ status }: { status: string }) {
  const known = isDataOrderStatus(status) ? status : "processing";
  return (
    <span
      className={cn(
        "inline-flex whitespace-nowrap rounded-full px-2.5 py-1 text-[11px] font-semibold",
        DATA_STATUS_TONES[known],
      )}
    >
      {DATA_STATUS_LABELS[known]}
    </span>
  );
}

const PAYMENT_TONES: Record<string, string> = {
  paid: "bg-niki-success/10 text-niki-success ring-1 ring-niki-success/30",
  unpaid: "bg-niki-danger/10 text-niki-danger ring-1 ring-niki-danger/30",
};

export function PaymentPill({ status }: { status: string }) {
  return (
    <span
      className={cn(
        "inline-flex whitespace-nowrap rounded-full px-2.5 py-1 text-[11px] font-semibold",
        PAYMENT_TONES[status] ?? PAYMENT_TONES.unpaid,
      )}
    >
      {status === "paid" ? "Payment success" : "Payment pending"}
    </span>
  );
}

/** Where an order came from: the agent's store, their dashboard, or NikiMart. */
export function SourcePill({ source }: { source: string }) {
  const label =
    source === "STOREFRONT" ? "Storefront" : source === "AGENT" ? "Dashboard" : "Web";
  return (
    <span className="inline-flex whitespace-nowrap rounded-full bg-niki-navy/5 px-2.5 py-1 text-[11px] font-semibold text-niki-ink/60">
      {label}
    </span>
  );
}

/**
 * A table that scrolls sideways rather than squashing on a phone. Every agent
 * table is wrapped in this — a nine-column order list has nowhere to go on a
 * 360px screen, and shrinking the type until it fits helps nobody.
 */
export function TableScroll({ children }: { children: ReactNode }) {
  return (
    <div className="-mx-5 overflow-x-auto px-5">
      <div className="min-w-full">{children}</div>
    </div>
  );
}

export function EmptyRow({ children }: { children: ReactNode }) {
  return (
    <div className="rounded-2xl bg-niki-surface px-4 py-10 text-center text-sm text-niki-ink/55">
      {children}
    </div>
  );
}

/**
 * Prev / Next for a server-paged table. Pages are held in the query string so
 * the browser Back button walks them, and each control is an ActionLink so the
 * tap shows a spinner while the next page loads.
 */
export function Pager({
  page,
  pageCount,
  total,
  hrefFor,
  noun = "orders",
}: {
  page: number;
  pageCount: number;
  total: number;
  hrefFor: (page: number) => string;
  noun?: string;
}) {
  if (pageCount <= 1) {
    return (
      <p className="mt-4 text-xs text-niki-ink/45">
        {total} {noun}
      </p>
    );
  }

  const btn =
    "niki-chip rounded-full px-4 py-2 text-xs font-semibold text-niki-ink/75 hover:text-niki-ink";
  const dead = "rounded-full px-4 py-2 text-xs font-semibold text-niki-ink/25";

  return (
    <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
      <p className="text-xs text-niki-ink/45">
        Page {page} of {pageCount} · {total} {noun}
      </p>
      <div className="flex gap-2">
        {page > 1 ? (
          <ActionLink href={hrefFor(page - 1)} className={btn}>
            Prev
          </ActionLink>
        ) : (
          <span className={dead}>Prev</span>
        )}
        {page < pageCount ? (
          <ActionLink href={hrefFor(page + 1)} className={btn}>
            Next
          </ActionLink>
        ) : (
          <span className={dead}>Next</span>
        )}
      </div>
    </div>
  );
}

/** Short date+time, in the format the reference screens use. */
export function formatWhen(date: Date): string {
  return date.toLocaleString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}
