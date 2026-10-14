import type { Metadata } from "next";
import { Suspense } from "react";
import { Inbox } from "lucide-react";
import { Container } from "@/components/ui/Container";
import { PanelHeading } from "@/components/admin/ModuleHeader";
import { AffiliateModuleHeader } from "@/components/admin/AffiliateModuleHeader";
import { ApplicationDecision } from "@/components/admin/AffiliateAdminTools";
import { ConsoleFilters } from "@/components/affiliate/ConsoleFilters";
import { ConsolePill, ConsoleRow, ConsoleTable, formatWhen, td } from "@/components/affiliate/ConsoleTable";
import { requireDashboard } from "@/lib/session";
import { APPLICATION_STATUS_OPTIONS, getApplications } from "@/lib/affiliate-admin";
import { getAffiliatePolicy } from "@/lib/affiliate-settings";
import { perPageFrom } from "@/lib/data-bundles/order-filters";

export const metadata: Metadata = { title: "Affiliate applications — Admin — Nickimart" };
export const dynamic = "force-dynamic";

const CHANNEL_LABELS: Record<string, string> = {
  whatsapp: "WhatsApp",
  instagram: "Instagram",
  tiktok: "TikTok",
  facebook: "Facebook",
  x: "X",
  telegram: "Telegram",
  snapchat: "Snapchat",
  campus: "In person",
};

/**
 * People asking to join, and the three things that decide it.
 *
 * Where they will post, how many people see it, and what they already are on
 * Nickimart — a shop owner or somebody with a dozen orders behind them is a
 * different proposition from an account created this morning. Sellers and
 * bundle agents never appear here at all while auto-approval is on; they have
 * been verified once already.
 */
export default async function AdminAffiliateApplicationsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; q?: string; page?: string; per?: string }>;
}) {
  await requireDashboard("/admin");
  const params = await searchParams;

  const status = APPLICATION_STATUS_OPTIONS.some((o) => o.value === params.status)
    ? params.status!
    : "pending";
  const query = (params.q ?? "").trim();
  const perPage = perPageFrom(params.per, 25);
  const page = Math.max(1, Number(params.page) || 1);

  const [policy, { rows, total }] = await Promise.all([
    getAffiliatePolicy(),
    getApplications({ status, q: query, page, perPage }),
  ]);
  const pageCount = Math.max(1, Math.ceil(total / perPage));

  return (
    <Container className="py-8">
      <AffiliateModuleHeader />

      <div className="mt-6">
        <PanelHeading
          title="Applications"
          subtitle={
            policy.applicationsOpen
              ? `Open to anybody. ${
                  policy.autoApproveSellers || policy.autoApproveAgents
                    ? "Sellers and bundle agents are admitted without applying."
                    : "Everybody applies, including sellers and agents."
                }`
              : "Applications are closed, so nothing new will arrive here."
          }
        />
      </div>

      <Suspense fallback={<div className="h-40" />}>
        <ConsoleFilters
          query={query}
          searchPlaceholder="Search by name, email or phone…"
          selects={[
            { key: "status", label: "Filter by status", value: status, options: APPLICATION_STATUS_OPTIONS },
          ]}
          shown={rows.length}
          total={total}
          page={page}
          pageCount={pageCount}
          noun="applications"
        />
      </Suspense>

      <ConsoleTable
        columns={["Applicant", "Contact", "Channels", "Audience", "Standing", "Wants", "Applied", "Status", "Decision"]}
        minWidth={1340}
        page={page}
        pageCount={pageCount}
        perPage={perPage}
        empty={
          status === "pending"
            ? "Nothing waiting. Applications land here the moment somebody applies."
            : "No applications match these filters."
        }
      >
        {rows.map((a) => (
          <ConsoleRow key={a.id}>
            <td className={td}>
              <p className="font-semibold text-niki-ink">{a.fullName}</p>
              {a.note ? (
                <p className="mt-0.5 line-clamp-2 max-w-[260px] text-[11px] leading-relaxed text-niki-ink/50">
                  {a.note}
                </p>
              ) : null}
            </td>
            <td className={`${td} text-xs`}>
              {a.phone ? (
                <a href={`tel:${a.phone}`} className="block font-mono text-niki-ink/70 hover:text-niki-orange">
                  {a.phone}
                </a>
              ) : null}
              {a.email ? (
                <a href={`mailto:${a.email}`} className="block text-niki-ink/55 hover:text-niki-orange">
                  {a.email}
                </a>
              ) : null}
            </td>
            <td className={td}>
              <div className="flex max-w-[180px] flex-wrap gap-1">
                {a.channels.length === 0 ? (
                  <span className="text-xs text-niki-ink/40">—</span>
                ) : (
                  a.channels.map((c) => (
                    <span
                      key={c}
                      className="rounded-md bg-niki-black/5 px-1.5 py-0.5 text-[10px] font-semibold text-niki-ink/60"
                    >
                      {CHANNEL_LABELS[c] ?? c}
                    </span>
                  ))
                )}
              </div>
            </td>
            <td className={`${td} max-w-[200px] text-xs text-niki-ink/60`}>{a.audience || "—"}</td>
            <td className={`${td} text-xs text-niki-ink/60`}>
              {a.isSeller ? (
                <ConsolePill status="approved" label="Has a shop" />
              ) : a.ordersPlaced > 0 ? (
                <span>
                  {a.ordersPlaced} order{a.ordersPlaced === 1 ? "" : "s"} placed
                </span>
              ) : (
                <span className="text-niki-ink/40">New account</span>
              )}
            </td>
            <td className={`${td} font-mono text-xs text-niki-orange`}>{a.desiredCode || "—"}</td>
            <td className={`${td} whitespace-nowrap text-xs text-niki-ink/55`}>
              {formatWhen(a.createdAt)}
            </td>
            <td className={td}>
              <ConsolePill
                status={a.status === "approved" ? "approved" : a.status === "rejected" ? "rejected" : "pending"}
                label={
                  a.status === "approved" ? "Approved" : a.status === "rejected" ? "Declined" : "Waiting"
                }
                title={a.decisionNote || undefined}
              />
            </td>
            <td className={td}>
              {a.status === "pending" ? (
                <ApplicationDecision id={a.id} />
              ) : (
                <span className="text-[11px] text-niki-ink/45">
                  {a.decidedAt ? formatWhen(a.decidedAt) : "—"}
                  {a.decisionNote ? (
                    <span className="mt-0.5 block max-w-[200px] text-niki-ink/35">
                      {a.decisionNote}
                    </span>
                  ) : null}
                </span>
              )}
            </td>
          </ConsoleRow>
        ))}
      </ConsoleTable>

      <p className="mt-4 flex items-start gap-2 text-xs leading-relaxed text-niki-ink/50">
        <Inbox className="mt-0.5 h-3.5 w-3.5 shrink-0" />
        Approving creates the affiliate account, gives them the code they asked for if it is free,
        and opens their console. Declining keeps the record and lets them apply again.
      </p>
    </Container>
  );
}
