import type { Metadata } from "next";
import { Suspense } from "react";
import { CheckCheck, Megaphone } from "lucide-react";
import { Container } from "@/components/ui/Container";
import { ModuleHeader } from "@/components/admin/ModuleHeader";
import { ModuleTabs } from "@/components/admin/ModuleTabs";
import { TableFilters } from "@/components/admin/TableFilters";
import { TablePager } from "@/components/admin/TablePager";
import { NotificationsList } from "@/components/admin/NotificationsList";
import { ANNOUNCEMENT_MODULE_TABS } from "@/lib/announcement-module";
import { perPageFrom } from "@/lib/data-bundles/order-filters";
import { listNotifications } from "@/lib/data-bundles/notifications";
import {
  NOTIFICATION_KIND_OPTIONS,
  NOTIFICATION_READ_OPTIONS,
} from "@/lib/data-bundles/notification-rules";
import { markAllNotificationsRead } from "@/lib/data-bundles/notification-actions";

export const metadata: Metadata = { title: "Notifications — Admin — Nickimart" };
export const dynamic = "force-dynamic";

/**
 * What the platform has told the admins, and whether anybody has dealt with it.
 *
 * The counts elsewhere in this console answer "what is outstanding"; this
 * answers "what happened". They are different questions, and the second one
 * used to have no answer at all: a withdrawal requested and paid inside an
 * afternoon left nothing behind saying anybody had ever been asked.
 *
 * Read is a decision here, not a side effect of arriving — the bell on the
 * overview shows the same rows and clears none of them by being opened.
 */
export default async function AdminDataNotificationsPage({
  searchParams,
}: {
  searchParams: Promise<{ kind?: string; read?: string; q?: string; page?: string; per?: string }>;
}) {
  const params = await searchParams;
  const kind = NOTIFICATION_KIND_OPTIONS.some((k) => k.value === params.kind)
    ? params.kind!
    : "all";
  const read = NOTIFICATION_READ_OPTIONS.some((r) => r.value === params.read)
    ? params.read!
    : "all";
  const query = (params.q ?? "").trim();
  const perPage = perPageFrom(params.per, 25);
  const page = Math.max(1, Number(params.page) || 1);

  const { rows, total, unread } = await listNotifications({ kind, read, query, page, perPage });
  const pageCount = Math.max(1, Math.ceil(total / perPage));

  return (
    <Container className="py-8">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <ModuleHeader
          title="Announcements"
          subtitle="What Nickimart says to people: on their screen, when something happens, and on purpose."
          icon={Megaphone}
        />
        {unread > 0 ? (
          <form action={markAllNotificationsRead}>
            <button
              type="submit"
              className="niki-press flex shrink-0 items-center gap-1.5 rounded-lg bg-white px-4 py-2.5 text-sm font-semibold text-niki-ink/70 ring-1 ring-niki-edge transition-colors hover:bg-niki-black/5"
            >
              <CheckCheck className="h-4 w-4" />
              Mark all read
            </button>
          </form>
        ) : null}
      </div>

      <div className="mt-5">
        <ModuleTabs tabs={ANNOUNCEMENT_MODULE_TABS("data", unread)} />
      </div>

      <div className="mt-6">
        <Suspense fallback={<div className="h-40" />}>
          <TableFilters
            query={query}
            searchPlaceholder="Search notifications…"
            searchLabel="Search notifications"
            filters={[
              { key: "kind", label: "Filter by kind", value: kind, options: NOTIFICATION_KIND_OPTIONS },
              { key: "read", label: "Filter by read", value: read, options: NOTIFICATION_READ_OPTIONS },
            ]}
            shown={rows.length}
            total={total}
            page={page}
            pageCount={pageCount}
            noun="notifications"
          />
        </Suspense>
      </div>

      <section className="mt-4 rounded-2xl bg-white p-5 ring-1 ring-niki-edge">
        <NotificationsList
          rows={rows}
          emptyHint={
            query || kind !== "all" || read !== "all"
              ? "Nothing matches those filters."
              : "Nothing has happened that needed telling you about yet."
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
