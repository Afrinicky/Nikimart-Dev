import type { Metadata } from "next";
import { Suspense } from "react";
import { AlertTriangle, Gift, LifeBuoy, Megaphone, ShieldAlert, Timer, Users } from "lucide-react";
import { Container } from "@/components/ui/Container";
import { ModuleHeader } from "@/components/admin/ModuleHeader";
import { ModuleTabs } from "@/components/admin/ModuleTabs";
import { TableFilters } from "@/components/admin/TableFilters";
import { TablePager } from "@/components/admin/TablePager";
import { StatusBar } from "@/components/admin/charts/StatusBar";
import { BarList } from "@/components/admin/charts/BarList";
import { ComplaintRowActions } from "@/components/admin/retail/ComplaintRowActions";
import { ActionLink } from "@/components/ui/motion";
import { formatPrice } from "@/lib/format";
import { normalizeGhPhone } from "@/lib/phone";
import { requireDashboard } from "@/lib/session";
import { perPageFrom } from "@/lib/data-bundles/order-filters";
import { ANNOUNCEMENT_MODULE_TABS } from "@/lib/announcement-module";
import {
  COMPLAINT_SOURCE_COLOUR,
  COMPLAINT_SOURCE_LABELS,
  COMPLAINT_SOURCE_OPTIONS,
  COMPLAINT_SOURCE_TONES,
  COMPLAINT_STATE_OPTIONS,
  countOpenComplaints,
  getComplaints,
  sourceFilter,
  stateFilter,
  summarise,
  type ComplaintSource,
} from "@/lib/retail/complaints";
import { cn } from "@/lib/cn";

export const metadata: Metadata = { title: "Complaints & enquiries — Admin — Nickimart" };
export const dynamic = "force-dynamic";

const th = "px-3 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wide text-niki-ink/45";
const td = "px-3 py-3 align-middle";

/**
 * Everything somebody is unhappy about.
 *
 * It arrived in three places and was worked in none of them: an affiliate's
 * enquiry in the affiliate console, a buyer's complaint in a thread only their
 * affiliate could see, a supplier who took money and never shipped on the
 * purchase record. So nobody could answer "what is unhappy right now", which
 * is the only question this desk exists for.
 *
 * One queue, oldest-unanswered first, with the phone number on the row —
 * because a complaint is settled by talking to the person, and every minute
 * spent finding their number is a minute the complaint is getting older.
 */
export default async function ComplaintsDeskPage({
  searchParams,
}: {
  searchParams: Promise<{
    source?: string;
    state?: string;
    q?: string;
    page?: string;
    per?: string;
  }>;
}) {
  await requireDashboard("/admin");
  const params = await searchParams;

  const source = sourceFilter(params.source);
  const state = stateFilter(params.state);
  const query = (params.q ?? "").trim().toLowerCase();
  const perPage = perPageFrom(params.per, 25);
  const page = Math.max(1, Number(params.page) || 1);

  // The counts describe everything open, whatever the filters say — a desk
  // whose headline figure answers to its own filter cannot be glanced at.
  const [all, filtered] = await Promise.all([
    getComplaints({ state: "open", source: "all" }),
    getComplaints({ state, source }),
  ]);
  const totals = summarise(all);

  const rows = query
    ? filtered.filter((r) =>
        `${r.subject} ${r.summary} ${r.personName} ${r.orderNumber} ${r.topic}`
          .toLowerCase()
          .includes(query),
      )
    : filtered;

  const total = rows.length;
  const pageCount = Math.max(1, Math.ceil(total / perPage));
  const shown = rows.slice((page - 1) * perPage, (page - 1) * perPage + perPage);

  const slices = (["dispute", "customer", "enquiry"] as ComplaintSource[])
    .map((key) => ({
      key,
      label: COMPLAINT_SOURCE_LABELS[key],
      count: all.filter((r) => r.source === key).length,
      colour: COMPLAINT_SOURCE_COLOUR[key],
      href: `/admin/announcements/enquiries?source=${key}`,
    }))
    .filter((s) => s.count > 0);

  const byTopic = [...all.reduce((map, r) => {
    const key = r.topic || "general";
    map.set(key, (map.get(key) ?? 0) + 1);
    return map;
  }, new Map<string, number>())]
    .map(([key, count]) => ({ key, label: key.replace(/_/g, " "), value: count }))
    .sort((a, b) => b.value - a.value)
    .slice(0, 8);

  const sourceOptions = COMPLAINT_SOURCE_OPTIONS.map((o) => {
    const n = o.value === "all" ? all.length : all.filter((r) => r.source === o.value).length;
    return n > 0 ? { ...o, label: `${o.label} (${n})` } : { ...o };
  });

  return (
    <Container className="py-6 sm:py-8">
      <ModuleHeader
        title="Announcements"
        subtitle="What Nickimart says to people, and what they say back."
        icon={Megaphone}
      />

      <div className="mt-5 sm:mt-6">
        <ModuleTabs tabs={ANNOUNCEMENT_MODULE_TABS("retail", 0, await countOpenComplaints())} />
      </div>

      <div className="mt-4">
        <h2 className="font-display text-lg font-bold text-niki-ink sm:text-xl">
          Complaints &amp; enquiries
        </h2>
        <p className="mt-0.5 text-sm text-niki-ink/60">
          Every open complaint, enquiry and dispute, oldest unanswered first.
        </p>
      </div>

      {totals.stale > 0 ? (
        <ActionLink
          href="/admin/announcements/enquiries"
          className="niki-focus group mt-4 flex items-center gap-2.5 rounded-2xl bg-niki-danger/[0.07] px-3 py-2.5 text-[13px] font-medium text-niki-danger ring-1 ring-niki-danger/20 transition-colors hover:bg-niki-danger/[0.12] sm:gap-3 sm:px-4 sm:py-3 sm:text-sm"
        >
          <span className="relative flex h-8 w-8 shrink-0 items-center justify-center sm:h-9 sm:w-9">
            <span
              aria-hidden
              className="absolute inset-0 animate-ping rounded-xl bg-niki-danger/30 opacity-40"
            />
            <span className="relative flex h-8 w-8 items-center justify-center rounded-xl bg-niki-danger/15 sm:h-9 sm:w-9">
              <AlertTriangle className="h-4 w-4" />
            </span>
          </span>
          <span className="min-w-0 flex-1">
            {totals.stale} {totals.stale === 1 ? "person has" : "people have"} been waiting a week
            or more without a reply
            {totals.longestQuietDays > 0 ? `, the longest for ${totals.longestQuietDays} days` : ""}.
          </span>
        </ActionLink>
      ) : null}

      <section className="mt-4 grid grid-cols-2 gap-2.5 sm:gap-3 xl:grid-cols-5">
        <Tile
          label="Open"
          value={String(totals.open)}
          note="Across every source"
          icon={LifeBuoy}
          href="/admin/announcements/enquiries"
        />
        <Tile
          label="Urgent"
          value={String(totals.urgent)}
          note="Money out or marked urgent"
          icon={ShieldAlert}
          tone={totals.urgent > 0 ? "danger" : "ink"}
          href="/admin/announcements/enquiries?state=urgent"
        />
        <Tile
          label="From buyers"
          value={String(totals.customers)}
          note="Complaints about an order"
          icon={Users}
          tone={totals.customers > 0 ? "orange" : "ink"}
          href="/admin/announcements/enquiries?source=customer"
        />
        <Tile
          label="From affiliates"
          value={String(totals.enquiries)}
          note="Waiting on an answer from us"
          icon={Gift}
          href="/admin/announcements/enquiries?source=enquiry"
        />
        <Tile
          label="Money at risk"
          value={formatPrice(totals.atRisk)}
          note={`${totals.disputes} supplier dispute${totals.disputes === 1 ? "" : "s"} open`}
          icon={Timer}
          tone={totals.atRisk > 0 ? "danger" : "ink"}
          href="/admin/announcements/enquiries?source=dispute"
        />
      </section>

      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        <section className="rounded-2xl bg-white p-4 ring-1 ring-niki-edge sm:p-5">
          <div className="mb-4">
            <h3 className="font-display font-bold text-niki-ink">Where it comes from</h3>
            <p className="text-xs text-niki-ink/55">Everything open, right now</p>
          </div>
          <StatusBar slices={slices} />
        </section>

        <section className="rounded-2xl bg-white p-4 ring-1 ring-niki-edge sm:p-5 lg:col-span-2">
          <div className="mb-4">
            <h3 className="font-display font-bold text-niki-ink">What it is about</h3>
            <p className="text-xs text-niki-ink/55">
              The same complaint arriving over and over is a thing to fix, not a thing to answer
            </p>
          </div>
          <BarList
            rows={byTopic}
            format={(v) => `${v} open`}
            empty="Nothing is open. Rare and good."
          />
        </section>
      </div>

      <div className="mt-4">
        <Suspense fallback={<div className="h-40" />}>
          <TableFilters
            query={params.q ?? ""}
            searchPlaceholder="Search by subject, person, order or message…"
            searchLabel="Search complaints"
            filters={[
              { key: "source", label: "Filter by source", value: source, options: sourceOptions },
              { key: "state", label: "Filter by state", value: state, options: [...COMPLAINT_STATE_OPTIONS] },
            ]}
            shown={shown.length}
            total={total}
            page={page}
            pageCount={pageCount}
            noun="items"
          />
        </Suspense>
      </div>

      <section className="mt-4 rounded-2xl bg-white p-4 ring-1 ring-niki-edge sm:p-5">
        {shown.length === 0 ? (
          <p className="py-8 text-center text-sm text-niki-ink/50">
            Nothing matches these filters — which, on the open ones, is the right answer.
          </p>
        ) : (
          <>
            <div className="-mx-4 overflow-x-auto px-4 sm:-mx-5 sm:px-5">
              <table className="w-full min-w-[980px] border-separate border-spacing-0 text-sm">
                <thead>
                  <tr className="bg-niki-surface/70">
                    <th className={`${th} rounded-l-xl`}>What</th>
                    <th className={th}>Who</th>
                    <th className={th}>Source</th>
                    <th className={th}>Order</th>
                    <th className={th}>Waiting</th>
                    <th className={th}>State</th>
                    <th className={`${th} rounded-r-xl`}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {shown.map((r) => {
                    const wa = normalizeGhPhone(r.whatsapp);
                    return (
                      <tr
                        key={`${r.source}-${r.id}`}
                        className={cn(
                          "border-b border-niki-edge transition-colors last:border-0 hover:bg-niki-surface/50",
                          r.open && r.priority === "urgent" && "bg-niki-danger/[0.04]",
                        )}
                      >
                        <td className={td}>
                          <ActionLink
                            href={r.href}
                            className="block max-w-[16rem] truncate font-semibold text-niki-ink hover:text-niki-orange"
                            title={r.subject}
                          >
                            {r.subject}
                          </ActionLink>
                          <span className="mt-0.5 block max-w-[20rem] truncate text-[11px] text-niki-ink/45">
                            {r.summary}
                          </span>
                        </td>

                        <td className={td}>
                          <span className="block max-w-[10rem] truncate text-niki-ink/80">
                            {r.personName}
                          </span>
                          <span className="mt-0.5 block text-[11px] text-niki-ink/45">
                            {r.personRole}
                            {r.phone ? ` · ${r.phone}` : ""}
                          </span>
                        </td>

                        <td className={td}>
                          <span
                            className={cn(
                              "inline-flex whitespace-nowrap rounded-full px-2.5 py-1 text-[11px] font-semibold",
                              COMPLAINT_SOURCE_TONES[r.source],
                            )}
                          >
                            {COMPLAINT_SOURCE_LABELS[r.source]}
                          </span>
                        </td>

                        <td className={td}>
                          {r.orderId ? (
                            <ActionLink
                              href={`/admin/orders/${r.orderId}`}
                              className="font-mono text-[11px] font-semibold text-niki-trust hover:underline"
                            >
                              {r.orderNumber}
                            </ActionLink>
                          ) : (
                            <span className="text-[11px] text-niki-ink/30">—</span>
                          )}
                          {r.amount > 0 ? (
                            <span className="mt-0.5 block text-[11px] text-niki-ink/45">
                              {formatPrice(r.amount)}
                            </span>
                          ) : null}
                        </td>

                        <td className={td}>
                          <span
                            className={cn(
                              "font-figures font-semibold",
                              r.quietDays >= 7 ? "text-niki-danger" : "text-niki-ink/75",
                            )}
                          >
                            {r.quietDays === 0 ? "today" : `${r.quietDays}d`}
                          </span>
                          <span className="mt-0.5 block text-[11px] text-niki-ink/40">
                            since{" "}
                            {r.lastAt.toLocaleDateString("en-GB", {
                              day: "2-digit",
                              month: "short",
                            })}
                          </span>
                        </td>

                        <td className={td}>
                          <span
                            className={cn(
                              "inline-flex whitespace-nowrap rounded-full px-2.5 py-1 text-[11px] font-semibold",
                              r.open
                                ? r.stateLabel === "Waiting on us"
                                  ? "bg-niki-gold/20 text-amber-900 ring-1 ring-niki-gold/30"
                                  : "bg-niki-trust/10 text-niki-trust ring-1 ring-niki-trust/25"
                                : "bg-niki-success/10 text-niki-success ring-1 ring-niki-success/30",
                            )}
                          >
                            {r.stateLabel}
                          </span>
                        </td>

                        <td className={td}>
                          <ComplaintRowActions
                            href={r.href}
                            subject={r.subject}
                            phone={r.phone || undefined}
                            whatsapp={wa ?? undefined}
                            email={r.email || undefined}
                            message={`Hello${r.personName ? ` ${r.personName.split(" ")[0]}` : ""}, about ${
                              r.orderNumber ? `your Nickimart order ${r.orderNumber}` : r.subject
                            }: `}
                          />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <Suspense fallback={<div className="h-12" />}>
              <TablePager page={page} pageCount={pageCount} perPage={perPage} />
            </Suspense>
          </>
        )}
      </section>
    </Container>
  );
}

function Tile({
  label,
  value,
  note,
  icon: Icon,
  href,
  tone = "ink",
}: {
  label: string;
  value: string;
  note: string;
  icon: React.ElementType;
  href?: string;
  tone?: "ink" | "orange" | "danger";
}) {
  const tones = {
    ink: "text-niki-ink",
    orange: "text-niki-orange",
    danger: "text-niki-danger",
  } as const;

  const body = (
    <>
      <div className="flex items-center gap-1.5 text-niki-ink/50 sm:gap-2">
        <Icon className="h-3.5 w-3.5 shrink-0 sm:h-4 sm:w-4" />
        <span className="truncate text-[10px] font-semibold uppercase tracking-wide sm:text-xs">
          {label}
        </span>
      </div>
      <p className={`mt-1.5 font-figures text-lg font-bold sm:mt-2 sm:text-2xl ${tones[tone]}`}>
        {value}
      </p>
      <p className="mt-0.5 truncate text-[11px] text-niki-ink/45 sm:text-xs">{note}</p>
    </>
  );

  if (!href) return <div className="rounded-2xl bg-white p-3.5 ring-1 ring-niki-edge sm:p-5">{body}</div>;
  return (
    <ActionLink
      href={href}
      className="niki-focus group block rounded-2xl bg-white p-3.5 ring-1 ring-niki-edge transition-colors hover:ring-niki-orange/50 sm:p-5"
    >
      {body}
    </ActionLink>
  );
}
