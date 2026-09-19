import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import {
  ArrowLeft,
  ListOrdered,
  Phone,
  ReceiptText,
  TrendingUp,
  UserRound,
  Users,
} from "lucide-react";
import { ActionLink } from "@/components/ui/motion";
import { AgentPageHeading, Card, formatWhen } from "@/components/agent/AgentUi";
import { requireUser } from "@/lib/session";
import { formatMoney } from "@/lib/format";
import { getAgentForUser } from "@/lib/data-bundles/agents";
import { resolveWindow } from "@/lib/data-bundles/overview-window";
import { memberLevelFor } from "@/lib/data-bundles/team/hierarchy";
import { getMemberProfile, getTeamIncomeEntries } from "@/lib/data-bundles/team/metrics";
import {
  ACTIVITY_LABELS,
  ACTIVITY_TONES,
  TEAM_INCOME_LABELS,
  type TeamIncomeType,
} from "@/lib/data-bundles/team/rules";
import { cn } from "@/lib/cn";

export const metadata: Metadata = { title: "Team member — Agent — Nickimart" };
export const dynamic = "force-dynamic";

/**
 * One member of a team, as their leader sees them.
 *
 * The leader is whoever is signed in, never whoever the URL says: an id typed
 * into the address bar is checked against their own two levels and refused if
 * it is not one of them, so this cannot become a way to read somebody else's
 * downline.
 *
 * Window and lifetime side by side, because a quiet month is not the same as a
 * bad agent and a leader deciding who to call needs both.
 */
function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-2xl bg-white p-4 ring-1 ring-niki-edge sm:p-5">
      <p className="text-[11px] font-semibold uppercase leading-tight tracking-wide text-niki-ink/45">
        {label}
      </p>
      <p className="mt-2 font-figures text-xl font-bold text-niki-ink sm:text-2xl">{value}</p>
      {hint ? <p className="mt-1 text-xs text-niki-ink/50">{hint}</p> : null}
    </div>
  );
}

function Line({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-4 border-b border-niki-edge py-2.5 last:border-0">
      <dt className="shrink-0 text-sm text-niki-ink/55">{label}</dt>
      <dd className="min-w-0 truncate text-right text-sm font-medium text-niki-ink">{value}</dd>
    </div>
  );
}

export default async function TeamMemberPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams?: Promise<{ days?: string; from?: string; to?: string }>;
}) {
  const user = await requireUser();
  const agent = await getAgentForUser(user.id);
  if (!agent) redirect("/become-an-agent");

  const { id } = await params;
  // The permission check: their own two levels, and nothing else.
  const level = await memberLevelFor(agent.id, id);
  if (!level) notFound();

  const period = resolveWindow(await searchParams);
  const [member, entries] = await Promise.all([
    getMemberProfile(agent.id, id, level, period),
    getTeamIncomeEntries(agent.id, period, { memberId: id, take: 20 }),
  ]);
  if (!member) notFound();

  return (
    <div className="space-y-5">
      <ActionLink
        href="/agent/team"
        className="inline-flex items-center gap-1.5 text-sm font-semibold text-niki-ink/60 hover:text-niki-orange"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to my team
      </ActionLink>

      <AgentPageHeading
        title={member.storeName}
        subtitle={`${member.code}${member.ownerName ? ` · ${member.ownerName}` : ""} · ${
          level === 1 ? "Direct recruit" : "Second level"
        }`}
      >
        <span
          className={cn(
            "rounded-full px-3 py-1.5 text-xs font-bold uppercase",
            ACTIVITY_TONES[member.activity],
          )}
        >
          {ACTIVITY_LABELS[member.activity]}
        </span>
      </AgentPageHeading>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Sales" value={formatMoney(member.sales)} hint={period.label} />
        <Stat label="Orders" value={String(member.orders)} hint={period.label} />
        <Stat label="Customers" value={String(member.customers)} hint="Buyers they served" />
        <Stat
          label="Income to you"
          value={formatMoney(member.income)}
          hint={`${formatMoney(member.lifetimeIncome)} all time`}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="space-y-4">
          <Card
            title="Where their income came from"
            description={`Credits to your balance · ${period.label}`}
            icon={ReceiptText}
          >
            {entries.length === 0 ? (
              <p className="rounded-xl bg-niki-surface px-4 py-8 text-center text-sm text-niki-ink/55">
                They have earned you nothing in this window.
              </p>
            ) : (
              <ul className="divide-y divide-niki-edge">
                {entries.map((e) => (
                  <li key={e.id} className="flex items-center justify-between gap-3 py-2.5">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-niki-ink">
                        {TEAM_INCOME_LABELS[e.type as TeamIncomeType] ?? e.type}
                      </p>
                      <p className="truncate text-[11px] text-niki-ink/45">
                        {formatWhen(e.createdAt)}
                      </p>
                    </div>
                    <span className="shrink-0 font-figures text-sm font-bold text-niki-success">
                      +{formatMoney(e.amount)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card title="What they have been selling" description="Their last ten paid orders" icon={ListOrdered}>
            {member.recentOrders.length === 0 ? (
              <p className="rounded-xl bg-niki-surface px-4 py-8 text-center text-sm text-niki-ink/55">
                They have not sold anything yet. This is where a call helps.
              </p>
            ) : (
              <ul className="divide-y divide-niki-edge">
                {member.recentOrders.map((o) => (
                  <li key={o.id} className="flex items-center justify-between gap-3 py-2.5">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-niki-ink">
                        {o.sizeGb}GB {o.network}
                      </p>
                      <p className="truncate font-mono text-[11px] text-niki-ink/45">
                        {o.reference} · {formatWhen(o.createdAt)}
                      </p>
                    </div>
                    <span className="shrink-0 font-figures text-sm font-semibold text-niki-ink">
                      {formatMoney(o.price)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card
            title="Who they have recruited"
            description="Their own team building"
            icon={Users}
          >
            {member.recruits.length === 0 ? (
              <p className="rounded-xl bg-niki-surface px-4 py-8 text-center text-sm text-niki-ink/55">
                They have not recruited anybody yet.
              </p>
            ) : (
              <ul className="divide-y divide-niki-edge">
                {member.recruits.map((r) => (
                  <li key={r.id} className="flex items-center justify-between gap-3 py-2.5">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-niki-ink">{r.storeName}</p>
                      <p className="truncate font-mono text-[11px] text-niki-ink/45">{r.code}</p>
                    </div>
                    <span className="shrink-0 text-[11px] text-niki-ink/45">
                      {formatWhen(r.joinedAt)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>

        <div className="space-y-4">
          <Card title="All time" icon={TrendingUp}>
            <dl>
              <Line label="Sales" value={formatMoney(member.lifetimeSales)} />
              <Line label="Orders" value={String(member.lifetimeOrders)} />
              <Line
                label="Earned you"
                value={
                  <span className="text-niki-success">{formatMoney(member.lifetimeIncome)}</span>
                }
              />
              <Line
                label="Last sold"
                value={member.lastSoldAt ? formatWhen(member.lastSoldAt) : "Never"}
              />
            </dl>
          </Card>

          <Card title="Their account" icon={UserRound}>
            <dl>
              <Line label="Joined" value={formatWhen(member.joinedAt)} />
              <Line
                label="Registration"
                value={
                  member.registrationPaid ? (
                    <span className="text-niki-success">Paid</span>
                  ) : (
                    <span className="text-amber-600">Not paid yet</span>
                  )
                }
              />
              <Line
                label="Account"
                value={member.status === "active" ? "Active" : "Suspended"}
              />
              <Line label="Store" value={`/store/${member.slug}`} />
            </dl>
          </Card>

          {/* The point of a team screen: being able to pick up the phone. */}
          <Card title="Reach them" icon={Phone}>
            <dl>
              <Line
                label="Phone"
                value={
                  member.ownerPhone || member.supportPhone ? (
                    <a
                      href={`tel:${member.ownerPhone || member.supportPhone}`}
                      className="font-mono text-niki-trust hover:underline"
                    >
                      {member.ownerPhone || member.supportPhone}
                    </a>
                  ) : (
                    "—"
                  )
                }
              />
              <Line
                label="Email"
                value={
                  member.ownerEmail ? (
                    <a
                      href={`mailto:${member.ownerEmail}`}
                      className="text-niki-trust hover:underline"
                    >
                      {member.ownerEmail}
                    </a>
                  ) : (
                    "—"
                  )
                }
              />
            </dl>
          </Card>
        </div>
      </div>
    </div>
  );
}
