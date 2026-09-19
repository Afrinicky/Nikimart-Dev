import { ChevronRight, Users } from "lucide-react";
import { ActionLink } from "@/components/ui/motion";
import { formatMoney } from "@/lib/format";
import {
  ACTIVITY_LABELS,
  ACTIVITY_TONES,
  type MemberActivity,
} from "@/lib/data-bundles/team/rules";
import { cn } from "@/lib/cn";

/**
 * Who is selling, and what each of them is worth to the leader.
 *
 * The income column is the one that makes this a team screen rather than a
 * list of names: it is what this member has actually put in the leader's
 * balance over the window, read from the ledger rather than worked out from a
 * rate. Sorted by sales, because a leader scanning this is looking for who to
 * congratulate and who to call.
 */

export interface TeamTableRow {
  id: string;
  code: string;
  storeName: string;
  ownerName: string;
  level: 1 | 2;
  status: string;
  activity: MemberActivity;
  sales: number;
  orders: number;
  customers: number;
  teamSize: number;
  income: number;
}

export function TeamTable({ rows, empty }: { rows: TeamTableRow[]; empty: string }) {
  if (rows.length === 0) {
    return (
      <div className="px-4 py-12 text-center">
        <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-niki-surface text-niki-ink/35">
          <Users className="h-5 w-5" />
        </span>
        <p className="mt-3 font-display font-bold text-niki-ink">No one here yet</p>
        <p className="mx-auto mt-1 max-w-sm text-sm text-niki-ink/55">{empty}</p>
      </div>
    );
  }

  const top = Math.max(rows[0].sales, 1);

  return (
    <>
      <div className="hidden grid-cols-12 gap-3 px-3 pb-2 text-[11px] font-semibold uppercase tracking-wide text-niki-ink/40 sm:grid">
        <span className="col-span-4">Agent</span>
        <span className="col-span-1 text-right">Orders</span>
        <span className="col-span-2 text-right">Sales</span>
        <span className="col-span-2 text-right">Customers</span>
        <span className="col-span-1 text-right">Team</span>
        <span className="col-span-2 text-right">Income to you</span>
      </div>

      <ul className="space-y-1">
        {rows.map((m) => (
          <li key={m.id}>
            <ActionLink
              href={`/agent/team/${m.id}`}
              className="niki-focus group block rounded-xl px-3 py-2.5 transition-colors hover:bg-niki-surface/70"
            >
              <div className="grid grid-cols-1 gap-1 sm:grid-cols-12 sm:items-center sm:gap-3">
                <div className="min-w-0 sm:col-span-4">
                  <p className="flex items-center gap-2 truncate text-sm font-semibold text-niki-ink">
                    {m.storeName}
                    <span
                      className={cn(
                        "shrink-0 rounded-md px-1.5 py-0.5 text-[10px] font-bold uppercase",
                        ACTIVITY_TONES[m.activity],
                      )}
                    >
                      {ACTIVITY_LABELS[m.activity]}
                    </span>
                    {m.status !== "active" ? (
                      <span className="shrink-0 text-[10px] font-bold uppercase text-niki-danger">
                        Suspended
                      </span>
                    ) : null}
                  </p>
                  <p className="truncate font-mono text-[11px] text-niki-ink/40">
                    {m.code}
                    {m.ownerName ? ` · ${m.ownerName}` : ""}
                    {m.level === 2 ? " · 2nd level" : ""}
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs sm:col-span-8 sm:grid sm:grid-cols-8 sm:gap-3 sm:text-sm">
                  <span className="text-niki-ink/60 sm:col-span-1 sm:text-right">
                    <span className="sm:hidden">Orders </span>
                    {m.orders}
                  </span>
                  <span className="font-figures font-bold text-niki-ink sm:col-span-2 sm:text-right">
                    {formatMoney(m.sales)}
                  </span>
                  <span className="text-niki-ink/60 sm:col-span-2 sm:text-right">
                    {m.customers}
                    <span className="ml-1 sm:hidden">customers</span>
                  </span>
                  <span className="text-niki-ink/45 sm:col-span-1 sm:text-right">
                    {m.teamSize}
                    <span className="ml-1 sm:hidden">team</span>
                  </span>
                  <span className="font-figures font-semibold text-niki-success sm:col-span-2 sm:text-right">
                    {formatMoney(m.income)}
                    <span className="ml-1 font-sans font-normal text-niki-ink/45 sm:hidden">
                      to you
                    </span>
                  </span>
                </div>
              </div>

              {/* The ranking made visible — every figure is printed, so the bar
                  adds shape rather than data. */}
              <div className="mt-2 flex items-center gap-2">
                <div className="h-1 w-full overflow-hidden rounded-full bg-niki-surface">
                  <div
                    className="h-full rounded-full bg-niki-orange"
                    style={{ width: `${Math.max(2, (m.sales / top) * 100)}%` }}
                  />
                </div>
                <ChevronRight className="h-3.5 w-3.5 shrink-0 text-niki-ink/25 transition-transform group-hover:translate-x-0.5" />
              </div>
            </ActionLink>
          </li>
        ))}
      </ul>
    </>
  );
}
