import type { Metadata } from "next";
import { Suspense } from "react";
import { redirect } from "next/navigation";
import {
  AlertTriangle,
  ArrowUpRight,
  Banknote,
  Coins,
  ListOrdered,
  TrendingUp,
  Trophy,
  Wallet,
} from "lucide-react";
import { ActionLink } from "@/components/ui/motion";
import { OverviewRange } from "@/components/admin/OverviewRange";
import { AgentTopup, type TopupBundle } from "@/components/agent/AgentTopup";
import { QuickActions } from "@/components/agent/QuickActions";
import { AgentTour } from "@/components/agent/AgentTour";
import { AgentAlerts, type AgentAlert } from "@/components/agent/AgentAlerts";
import { BoardCard } from "@/components/agent/LeaderboardUi";
import { requireUser } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { siteUrl } from "@/lib/site";
import { formatMoney } from "@/lib/format";
import {
  getAgentBundleRows,
  getAgentForUser,
  getAgentWallet,
  withdrawableFrom,
} from "@/lib/data-bundles/agents";
import { getLeaderboardView } from "@/lib/data-bundles/leaderboard";
import { referralLink } from "@/lib/data-bundles/referral-rules";
import { getPostsForMember } from "@/lib/data-bundles/team/communication";
import { getAgentWindowTotals, getAgentWindowWallet } from "@/lib/data-bundles/overview";
import { resolveWindow } from "@/lib/data-bundles/overview-window";

export const metadata: Metadata = { title: "Agent Dashboard — Nickimart" };
export const dynamic = "force-dynamic";

function Tile({
  label,
  value,
  hint,
  icon: Icon,
  tone = "ink",
  href,
}: {
  label: string;
  value: string;
  hint?: string;
  icon: React.ElementType;
  tone?: "ink" | "success" | "danger" | "orange";
  href?: string;
}) {
  const tones = {
    ink: "text-niki-ink",
    success: "text-niki-success",
    danger: "text-niki-danger",
    orange: "text-niki-orange",
  } as const;

  const body = (
    <>
      <div className="flex items-start gap-2 text-niki-ink/50">
        <Icon className="h-4 w-4" />
        <span className="text-[11px] font-semibold uppercase leading-tight tracking-wide sm:text-xs">{label}</span>
        {href ? (
          <ArrowUpRight className="ml-auto h-3.5 w-3.5 opacity-0 transition-opacity group-hover:opacity-100" />
        ) : null}
      </div>
      <p className={`mt-2 font-figures text-xl font-bold sm:text-2xl ${tones[tone]}`}>{value}</p>
      {hint ? <p className="mt-0.5 text-[11px] leading-snug text-niki-ink/50 sm:text-xs">{hint}</p> : null}
    </>
  );

  if (!href) return <div className="rounded-2xl bg-white p-5 ring-1 ring-niki-edge">{body}</div>;
  return (
    <ActionLink
      href={href}
      className="group niki-lift block rounded-2xl bg-white p-5 ring-1 ring-niki-edge hover:shadow-lg"
    >
      {body}
    </ActionLink>
  );
}

export default async function AgentDashboardPage({
  searchParams,
}: {
  searchParams?: Promise<{ days?: string; from?: string; to?: string }>;
}) {
  const user = await requireUser();
  const agent = await getAgentForUser(user.id);
  if (!agent) redirect("/become-an-agent");

  // The month is the window this dashboard opens on. An agent is paid by the
  // month and asks "how am I doing *this* month"; a lifetime total only ever
  // goes up, so it cannot answer that, and a rolling thirty days straddles two
  // months and answers it wrongly.
  const period = resolveWindow(await searchParams, new Date(), { fallback: "month" });

  const [wallet, rows, leaderboard] = await Promise.all([
    getAgentWallet(agent),
    getAgentBundleRows(agent.id),
    getLeaderboardView(agent.id),
  ]);

  // What they traded in the window, and what they took out of it. The balance
  // stays a standing figure: there is no such thing as "the balance during
  // March", and showing one would be a number nobody could reconcile.
  const [traded, moved] = await Promise.all([
    getAgentWindowTotals(agent.id, period),
    getAgentWindowWallet(agent.id, period, wallet.balance),
  ]);

  const bundles: TopupBundle[] = rows.map((r) => ({
    network: r.network,
    sizeGb: r.sizeGb,
    agentPrice: r.agentPrice,
    storePrice: r.price,
    validity: r.validity,
  }));

  const storeLink = `${siteUrl()}/store/${agent.slug}`;

  // What the strip has to say today. A list rather than a banner, because the
  // next thing worth saying should be a row added here.
  const [security, fromLeader] = await Promise.all([
    prisma.user
      .findUnique({ where: { id: user.id }, select: { twoFactorEnabled: true } })
      .catch(() => null),
    getPostsForMember(agent.id, 1),
  ]);

  const alerts: AgentAlert[] = [];

  // What their own recruiter has told them. The key carries the post id, so a
  // new one shows even after the last was waved away.
  const latest = fromLeader[0];
  if (latest) {
    alerts.push({
      key: `team-post:${latest.id}`,
      tone: "success",
      icon: "megaphone",
      title: latest.title,
      body: latest.body.length > 140 ? `${latest.body.slice(0, 140)}…` : latest.body,
      href: "/agent/team",
      cta: "Read it",
    });
  }

  if (security && !security.twoFactorEnabled) {
    alerts.push({
      key: "two-factor",
      tone: "info",
      icon: "shield",
      title: "Protect your account with two-step verification",
      body: "A code by text or email each time you sign in. Your commission lives behind this password.",
      href: "/agent/settings",
      cta: "Turn it on",
    });
  }

  return (
    <div className="space-y-5">
      {/* Things worth a moment before the numbers. */}
      <AgentAlerts alerts={alerts} />

      {/*
        What an agent logs in to do, before anything they log in to read: the
        three things they are always being asked to send, and the four screens
        they actually work in.
      */}
      <div data-tour="quick-actions">
        <QuickActions
          storeLink={storeLink}
          code={agent.code}
          referralLink={referralLink(siteUrl(), agent.code)}
          storeName={agent.storeName}
        />
      </div>

      {/* Balance and the numbers behind it. The window the figures answer to
          is picked here, and the balance is marked as the one that does not. */}
      <section>
        <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="font-display text-xl font-bold text-niki-ink">Your trading</h2>
            <p className="mt-0.5 text-sm text-niki-ink/60">
              What you sold and earned over the {period.label}.
            </p>
          </div>
          <Suspense fallback={<div className="h-9" />}>
            <OverviewRange
              active={period.key}
              label={period.label}
              from={period.from}
              to={period.to}
              basePath="/agent"
            />
          </Suspense>
        </div>

        <div className="grid grid-cols-2 gap-3 xl:grid-cols-5">
          <Tile
            label="Balance"
            value={formatMoney(wallet.balance)}
            hint={
              wallet.balance < 0
                ? `${formatMoney(-wallet.balance)} still to clear from commissions`
                : "Available to withdraw · as it stands"
            }
            icon={Wallet}
            tone={wallet.balance < 0 ? "danger" : "success"}
            href="/agent/wallet"
          />
          <Tile
            label="Store sales"
            value={formatMoney(traded.sales)}
            hint={`${traded.orders} paid ${traded.orders === 1 ? "order" : "orders"} · ${period.label}`}
            icon={ListOrdered}
            href="/agent/orders"
          />
          <Tile
            label="Commission earned"
            value={formatMoney(traded.agentCommission)}
            hint={
              wallet.commissionPending > 0
                ? `${formatMoney(wallet.commissionPending)} pending delivery`
                : `Credited on delivery · ${period.label}`
            }
            icon={TrendingUp}
            tone="orange"
            href="/agent/wallet"
          />
          <Tile
            label="Team commission"
            value={formatMoney(traded.teamCommission)}
            hint={`Earned by your recruiter on your sales · ${period.label}`}
            icon={Coins}
            href="/agent/team"
          />
          <Tile
            label="Withdrawn"
            value={formatMoney(moved.withdrawn)}
            hint={
              wallet.pendingWithdrawals > 0
                ? `${formatMoney(wallet.pendingWithdrawals)} awaiting payout`
                : `Paid to your MoMo · ${period.label}`
            }
            icon={Banknote}
            href="/agent/wallet"
          />
        </div>
      </section>

      {/* While the setup fee is outstanding, say plainly what is happening —
          a negative balance with no explanation reads as a bug. */}
      {wallet.outstandingSetup > 0 ? (
        <div className="animate-fade-up flex flex-col gap-3 rounded-2xl bg-niki-gold/10 p-5 ring-1 ring-niki-gold/40 sm:flex-row sm:items-center">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-niki-gold/20 text-niki-gold">
            <AlertTriangle className="h-5 w-5" />
          </span>
          <div>
            <p className="font-figures font-bold text-niki-ink">
              {formatMoney(wallet.outstandingSetup)} of your registration fee is still clearing
            </p>
            <p className="mt-1 text-sm text-niki-ink/65">
              Nothing to pay — it comes out of the commission you earn.
            </p>
          </div>
        </div>
      ) : null}

      {/* Data Topup */}
      <section>
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="font-display text-2xl font-bold text-niki-ink">Data topup</h1>
            <p className="mt-1 text-sm text-niki-ink/60">Send data at your agent price.</p>
          </div>
          <ActionLink
            href="/agent/orders"
            className="flex items-center gap-1.5 rounded-full bg-white px-4 py-2 text-xs font-semibold text-niki-ink/70 ring-1 ring-niki-edge hover:bg-niki-black/5"
          >
            <ListOrdered className="h-3.5 w-3.5" />
            Check delivery status
          </ActionLink>
        </div>

        <div className="mt-4" data-tour="topup">
          <AgentTopup bundles={bundles} balance={withdrawableFrom(wallet)} />
        </div>
      </section>

      {/*
        The leaderboard, cut down to what fits above the fold: the podium of
        each board plus wherever this agent stands. The full boards are one
        tap away — a dashboard that showed twenty rows three times over would
        push the thing agents actually come here to do off the screen.
      */}
      {leaderboard.enabled && leaderboard.boards.length > 0 ? (
        <section>
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <h2 className="flex items-center gap-2 font-display text-xl font-bold text-niki-ink">
                <Trophy className="h-5 w-5 text-niki-orange" />
                Leaderboard
              </h2>
              <p className="mt-1 text-sm text-niki-ink/60">{leaderboard.config.pitch}</p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="flex items-center gap-1.5 rounded-full bg-niki-black px-4 py-2 text-xs font-bold text-niki-gold">
                <Coins className="h-3.5 w-3.5" />
                {agent.pointsBalance.toLocaleString("en-GH")} points
              </span>
              <ActionLink
                href="/agent/leaderboard"
                className="flex items-center gap-1.5 rounded-full bg-white px-4 py-2 text-xs font-semibold text-niki-ink/70 ring-1 ring-niki-edge hover:bg-niki-black/5"
              >
                View full leaderboard
                <ArrowUpRight className="h-3.5 w-3.5" />
              </ActionLink>
            </div>
          </div>

          <div className="mt-4 grid gap-3 lg:grid-cols-2 xl:grid-cols-3">
            {leaderboard.boards.map((board) => (
              <BoardCard key={board.key} board={board} limit={3} />
            ))}
          </div>
        </section>
      ) : null}

      {/* Runs once, for somebody who has never seen any of this before. */}
      <AgentTour agentId={agent.id} autoStart />
    </div>
  );
}
