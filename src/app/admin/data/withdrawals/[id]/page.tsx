import type { Metadata } from "next";
import { notFound } from "next/navigation";
import {
  ArrowLeft,
  Banknote,
  CheckCircle2,
  Clock3,
  History,
  Smartphone,
  UserRound,
  XCircle,
} from "lucide-react";
import { Container } from "@/components/ui/Container";
import { ModuleHeader } from "@/components/admin/ModuleHeader";
import { ModuleTabs } from "@/components/admin/ModuleTabs";
import { ActionLink } from "@/components/ui/motion";
import { formatWhen } from "@/components/agent/AgentUi";
import { Users } from "lucide-react";
import { AGENT_MODULE_TABS, pendingApplicationCount } from "@/lib/data-bundles/agent-module";
import { formatMoney } from "@/lib/format";
import { getWithdrawal } from "@/lib/data-bundles/withdrawals";
import { processWithdrawal, rejectWithdrawal } from "@/lib/data-bundles/agent-admin-actions";
import { cn } from "@/lib/cn";

export const metadata: Metadata = { title: "Withdrawal — Admin — Nickimart" };
export const dynamic = "force-dynamic";

const TONES: Record<string, string> = {
  pending: "bg-amber-50 text-amber-700 ring-1 ring-amber-200",
  processed: "bg-niki-success/10 text-niki-success ring-1 ring-niki-success/30",
  rejected: "bg-niki-danger/10 text-niki-danger ring-1 ring-niki-danger/30",
};

const LABELS: Record<string, string> = {
  pending: "Waiting to be sent",
  processed: "Sent",
  rejected: "Rejected",
};

function Line({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-4 border-b border-niki-edge py-2.5 last:border-0">
      <dt className="shrink-0 text-sm text-niki-ink/55">{label}</dt>
      <dd className="min-w-0 truncate text-right text-sm font-medium text-niki-ink">{value}</dd>
    </div>
  );
}

function Panel({
  title,
  icon: Icon,
  subtitle,
  children,
}: {
  title: string;
  icon: React.ElementType;
  subtitle?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-2xl bg-white p-5 ring-1 ring-niki-edge">
      <div className="mb-3 flex items-center gap-2.5">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-niki-orange/10 text-niki-orange">
          <Icon className="h-4 w-4" />
        </span>
        <div className="min-w-0">
          <h2 className="font-display font-bold text-niki-ink">{title}</h2>
          {subtitle ? <p className="truncate text-xs text-niki-ink/55">{subtitle}</p> : null}
        </div>
      </div>
      {children}
    </section>
  );
}

/**
 * One payout, and everything needed to send it.
 *
 * A row in a table is enough to see that money is owed; it is not enough to
 * send it. Sending it means reading a number off a screen into a MoMo app and
 * being able to answer for it afterwards — so this puts the number, the name
 * it should match, the agent it belongs to and what they have been paid before
 * on one page, and the two buttons that record what happened underneath them.
 */
export default async function AdminWithdrawalDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const [withdrawal, waiting] = await Promise.all([getWithdrawal(id), pendingApplicationCount()]);
  if (!withdrawal) notFound();

  const w = withdrawal;
  const pending = w.status === "pending";
  const total = w.amount + w.fee;

  return (
    <Container className="py-8">
      <ModuleHeader
        title="Agent management"
        subtitle="Your reseller network: accounts, applications, payouts and the programme's rules."
        icon={Users}
      />
      <div className="mt-5">
        <ModuleTabs tabs={AGENT_MODULE_TABS(waiting)} />
      </div>

      <ActionLink
        href="/admin/data/withdrawals"
        className="mt-6 inline-flex items-center gap-1.5 text-sm font-semibold text-niki-ink/60 hover:text-niki-orange"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to withdrawals
      </ActionLink>

      <div className="mt-4 flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="font-figures text-3xl font-bold text-niki-ink">
              {formatMoney(w.amount)}
            </h1>
            <span
              className={cn(
                "rounded-md px-2 py-0.5 text-[10px] font-bold uppercase",
                TONES[w.status],
              )}
            >
              {LABELS[w.status] ?? w.status}
            </span>
          </div>
          <p className="mt-1 text-sm text-niki-ink/60">
            Requested {formatWhen(w.createdAt)} by{" "}
            <ActionLink
              href={`/admin/data/agents/${w.agent.id}`}
              className="font-semibold text-niki-trust hover:underline"
            >
              {w.agent.storeName}
            </ActionLink>
          </p>
        </div>

        {pending ? (
          <div className="flex flex-wrap gap-2">
            <form action={processWithdrawal}>
              <input type="hidden" name="withdrawalId" value={w.id} />
              <button
                type="submit"
                className="niki-press flex items-center gap-1.5 rounded-lg bg-niki-success px-4 py-2.5 text-sm font-bold text-white"
              >
                <CheckCircle2 className="h-4 w-4" />
                Mark sent
              </button>
            </form>
            <form action={rejectWithdrawal}>
              <input type="hidden" name="withdrawalId" value={w.id} />
              <button
                type="submit"
                className="niki-press flex items-center gap-1.5 rounded-lg bg-white px-4 py-2.5 text-sm font-bold text-niki-danger ring-1 ring-niki-danger/30"
              >
                <XCircle className="h-4 w-4" />
                Reject and return
              </button>
            </form>
          </div>
        ) : null}
      </div>

      {pending ? (
        <p className="mt-4 rounded-2xl bg-niki-gold/10 px-5 py-4 text-sm text-niki-ink/70 ring-1 ring-niki-gold/40">
          Send <span className="font-semibold text-niki-ink">{formatMoney(w.amount)}</span> to{" "}
          <span className="font-mono font-semibold text-niki-ink">{w.momoPhone}</span> on MoMo
          first, then mark it sent here. Rejecting puts the money back on their balance.
        </p>
      ) : null}

      <div className="mt-5 grid gap-4 lg:grid-cols-[minmax(0,1fr)_360px]">
        <div className="space-y-4">
          <Panel title="Send this" icon={Smartphone} subtitle="Exactly as the agent gave it">
            <dl>
              <Line
                label="MoMo number"
                value={<span className="font-mono text-base">{w.momoPhone}</span>}
              />
              <Line label="Network" value={w.momoNetwork} />
              <Line label="Name on the account" value={w.momoName} />
              <Line
                label="Amount to send"
                value={<span className="font-figures text-base">{formatMoney(w.amount)}</span>}
              />
              <Line
                label="Withdrawal fee kept"
                value={w.fee > 0 ? formatMoney(w.fee) : "None"}
              />
              <Line
                label="Taken off their balance"
                value={<span className="font-figures">{formatMoney(total)}</span>}
              />
            </dl>
            {w.momoName && w.user?.name && w.momoName.toLowerCase() !== w.user.name.toLowerCase() ? (
              <p className="mt-3 rounded-xl bg-amber-50 px-4 py-3 text-xs text-amber-800">
                The MoMo account is in a different name from the agent&apos;s own
                ({w.user.name}). That is often a family member&apos;s number and often fine —
                worth a glance before sending.
              </p>
            ) : null}
          </Panel>

          <Panel
            title="Their other payouts"
            icon={History}
            subtitle="Is this routine, or worth a second look?"
          >
            {w.history.length === 0 ? (
              <p className="rounded-xl bg-niki-surface px-4 py-6 text-center text-sm text-niki-ink/55">
                This is their first request.
              </p>
            ) : (
              <ul className="divide-y divide-niki-edge">
                {w.history.map((h) => (
                  <li key={h.id}>
                    <ActionLink
                      href={`/admin/data/withdrawals/${h.id}`}
                      className="niki-focus flex items-center justify-between gap-3 py-2.5 hover:text-niki-orange"
                    >
                      <span className="font-figures text-sm font-semibold text-niki-ink">
                        {formatMoney(h.amount)}
                      </span>
                      <span className="flex items-center gap-3">
                        <span className="text-[11px] text-niki-ink/45">
                          {formatWhen(h.createdAt)}
                        </span>
                        <span
                          className={cn(
                            "rounded-md px-2 py-0.5 text-[10px] font-bold uppercase",
                            TONES[h.status],
                          )}
                        >
                          {LABELS[h.status] ?? h.status}
                        </span>
                      </span>
                    </ActionLink>
                  </li>
                ))}
              </ul>
            )}
          </Panel>
        </div>

        <div className="space-y-4">
          <Panel title="The agent" icon={UserRound} subtitle={w.agent.code}>
            <dl>
              <Line
                label="Store"
                value={
                  <ActionLink
                    href={`/admin/data/agents/${w.agent.id}`}
                    className="text-niki-trust hover:underline"
                  >
                    {w.agent.storeName}
                  </ActionLink>
                }
              />
              <Line label="Owner" value={w.user?.name ?? "—"} />
              <Line label="Email" value={w.user?.email ?? "—"} />
              <Line
                label="Phone"
                value={
                  <span className="font-mono">
                    {w.agent.supportPhone || w.user?.phone || "—"}
                  </span>
                }
              />
              <Line
                label="Balance now"
                value={
                  <span
                    className={cn(
                      "font-figures",
                      w.agent.balance < 0 ? "text-niki-danger" : "text-niki-success",
                    )}
                  >
                    {formatMoney(w.agent.balance)}
                  </span>
                }
              />
              <Line
                label="Account"
                value={w.agent.status === "active" ? "Active" : "Suspended"}
              />
            </dl>
          </Panel>

          <Panel title="What happened" icon={pending ? Clock3 : Banknote}>
            <dl>
              <Line label="Requested" value={formatWhen(w.createdAt)} />
              <Line label="Status" value={LABELS[w.status] ?? w.status} />
              <Line label="Handled" value={w.processedAt ? formatWhen(w.processedAt) : "—"} />
              <Line label="By" value={w.processedBy ?? "—"} />
            </dl>
            {w.adminNote ? (
              <p className="mt-3 whitespace-pre-wrap rounded-xl bg-niki-surface px-4 py-3 text-xs text-niki-ink/70">
                {w.adminNote}
              </p>
            ) : null}
          </Panel>
        </div>
      </div>
    </Container>
  );
}
