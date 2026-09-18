import type { Metadata } from "next";
import { Suspense } from "react";
import { Megaphone, Plus } from "lucide-react";
import { Container } from "@/components/ui/Container";
import { ModuleHeader } from "@/components/admin/ModuleHeader";
import { ModuleTabs } from "@/components/admin/ModuleTabs";
import { ANNOUNCEMENT_MODULE_TABS } from "@/lib/announcement-module";
import { TableFilters } from "@/components/admin/TableFilters";
import { TablePager } from "@/components/admin/TablePager";
import { AnnouncementsTable } from "@/components/admin/AnnouncementsTable";
import { ActionLink } from "@/components/ui/motion";
import { perPageFrom } from "@/lib/data-bundles/order-filters";
import { listRetailAnnouncements } from "@/lib/retail-announcements";
import {
  ANNOUNCEMENT_STATUS_OPTIONS,
  audienceFilterOptions,
} from "@/lib/announcement-rules";

export const metadata: Metadata = { title: "Announcements — Admin — Nickimart" };
export const dynamic = "force-dynamic";

function Tile({ label, value, href }: { label: string; value: number; href: string }) {
  return (
    <ActionLink
      href={href}
      className="niki-focus block rounded-2xl bg-white p-5 ring-1 ring-niki-edge transition-colors hover:ring-niki-orange/50"
    >
      <p className="text-[11px] font-semibold uppercase tracking-wide text-niki-ink/45 sm:text-xs">
        {label}
      </p>
      <p className="mt-2 font-figures text-xl font-bold text-niki-ink sm:text-2xl">{value}</p>
    </ActionLink>
  );
}

/**
 * Announcements, as a module of its own.
 *
 * The mall's own, on its own rows. The bundle side has one too and they share
 * nothing: different people to talk to, different databases, and a notice to
 * data agents has no business on a shop's dashboard.
 */
export default async function AdminRetailAnnouncementsPage({
  searchParams,
}: {
  searchParams: Promise<{
    status?: string;
    audience?: string;
    q?: string;
    page?: string;
    per?: string;
  }>;
}) {
  const params = await searchParams;
  const audiences = audienceFilterOptions("retail");
  const status = ANNOUNCEMENT_STATUS_OPTIONS.some((s) => s.value === params.status)
    ? params.status!
    : "all";
  const audience = audiences.some((a) => a.value === params.audience) ? params.audience! : "all";
  const query = (params.q ?? "").trim();
  const perPage = perPageFrom(params.per, 25);
  const page = Math.max(1, Number(params.page) || 1);

  const { rows, total, counts } = await listRetailAnnouncements({
    status,
    audience,
    query,
    page,
    perPage,
  });
  const pageCount = Math.max(1, Math.ceil(total / perPage));

  return (
    <Container className="py-8">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <ModuleHeader
          title="Announcements"
          subtitle="What Nickimart says to people: on their screen, when something happens, and on purpose."
          icon={Megaphone}
        />
        <ActionLink
          href="/admin/announcements/new"
          className="niki-press flex shrink-0 items-center gap-1.5 rounded-lg bg-niki-orange px-4 py-2.5 text-sm font-semibold text-white hover:bg-niki-orange-light"
        >
          <Plus className="h-4 w-4" />
          New announcement
        </ActionLink>
      </div>

      <div className="mt-5">
        <ModuleTabs tabs={ANNOUNCEMENT_MODULE_TABS("retail")} />
      </div>

      <div className="mt-6 grid grid-cols-2 gap-3 xl:grid-cols-4">
        <Tile label="Live now" value={counts.live} href="/admin/announcements?status=live" />
        <Tile
          label="Scheduled"
          value={counts.scheduled}
          href="/admin/announcements?status=scheduled"
        />
        <Tile
          label="Expired"
          value={counts.expired}
          href="/admin/announcements?status=expired"
        />
        <Tile label="Hidden" value={counts.hidden} href="/admin/announcements?status=hidden" />
      </div>

      <div className="mt-6">
        <Suspense fallback={<div className="h-40" />}>
          <TableFilters
            query={query}
            searchPlaceholder="Search titles and messages…"
            searchLabel="Search announcements"
            filters={[
              {
                key: "status",
                label: "Filter by status",
                value: status,
                options: ANNOUNCEMENT_STATUS_OPTIONS,
              },
              { key: "audience", label: "Filter by audience", value: audience, options: audiences },
            ]}
            shown={rows.length}
            total={total}
            page={page}
            pageCount={pageCount}
            noun="announcements"
            exportHref="/admin/announcements/export"
          />
        </Suspense>
      </div>

      <section className="mt-4 rounded-2xl bg-white p-5 ring-1 ring-niki-edge">
        <AnnouncementsTable
          rows={rows}
          scope="retail"
          basePath="/admin/announcements"
          emptyHint={
            query || status !== "all" || audience !== "all"
              ? "Nothing matches those filters."
              : "Nothing has been announced yet."
          }
        />
        {rows.length > 0 ? (
          <Suspense fallback={<div className="h-12" />}>
            <TablePager page={page} pageCount={pageCount} perPage={perPage} />
          </Suspense>
        ) : null}
      </section>
    </Container>
  );
}
