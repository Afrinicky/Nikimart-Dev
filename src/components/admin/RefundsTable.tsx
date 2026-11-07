"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  Check,
  Loader2,
  Send,
  ShieldAlert,
  Smartphone,
  Undo2,
  Wallet,
} from "lucide-react";
import { formatWhen } from "@/components/agent/AgentUi";
import { formatMoney } from "@/lib/format";
import { bundleLabel, networkLabel } from "@/lib/data-bundles/networks";
import { cn } from "@/lib/cn";

/**
 * The refunds queue.
 *
 * Two kinds of row, and the difference is the only thing an admin is here to
 * act on. A wallet refund is finished the moment it is written — the ledger
 * holds it and the agent can already spend it. A refund owed to a buyer on
 * mobile money is an instruction to send cedis by hand, exactly like a payout,
 * and it stays on the screen until somebody says they sent it.
 *
 * So pending rows sort first and carry the only button on the table.
 */

export interface RefundTableRow {
  id: string;
  reference: string;
  amount: number;
  destination: string;
  status: string;
  momoPhone: string;
  momoName: string;
  momoNetwork: string;
  requestedBy: string;
  requestedByName: string;
  note: string;
  paidBy: string | null;
  paidAt: string | null;
  createdAt: string;
  agentName: string;
  agentCode: string;
  network: string;
  sizeGb: number;
  recipientPhone: string;
}

const th = "px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wide text-niki-ink/45";
const td = "px-4 py-3.5 align-middle";

function DestinationPill({ destination }: { destination: string }) {
  const wallet = destination === "WALLET";
  const Icon = wallet ? Wallet : Smartphone;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 whitespace-nowrap rounded-md px-2.5 py-1 text-[11px] font-semibold",
        wallet
          ? "bg-sky-50 text-sky-700 ring-1 ring-sky-200"
          : "bg-niki-gold/15 text-amber-700 ring-1 ring-niki-gold/40",
      )}
    >
      <Icon className="h-3 w-3" />
      {wallet ? "Agent wallet" : "Buyer MoMo"}
    </span>
  );
}

function StatePill({ status }: { status: string }) {
  const settled = status === "settled";
  return (
    <span
      className={cn(
        "inline-flex whitespace-nowrap rounded-full px-2.5 py-1 text-[11px] font-semibold",
        settled
          ? "bg-niki-success/10 text-niki-success ring-1 ring-niki-success/30"
          : "bg-amber-50 text-amber-700 ring-1 ring-amber-200",
      )}
    >
      {settled ? "Settled" : "Awaiting transfer"}
    </span>
  );
}

export function RefundsTable({
  rows,
  emptyHint,
  markSent,
}: {
  rows: RefundTableRow[];
  emptyHint: string;
  markSent: (refundId: string) => Promise<{ ok: boolean; message: string }>;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ ok: boolean; message: string } | null>(null);

  function send(id: string) {
    setNotice(null);
    setBusy(id);
    void markSent(id)
      .then((result) => {
        setNotice(result);
        if (result.ok) router.refresh();
      })
      .catch(() => setNotice({ ok: false, message: "That didn't go through. Try again." }))
      .finally(() => setBusy(null));
  }

  if (rows.length === 0) {
    return (
      <div className="px-4 py-12 text-center">
        <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-niki-surface text-niki-ink/35">
          <Undo2 className="h-5 w-5" />
        </span>
        <p className="mt-3 font-display font-bold text-niki-ink">Nothing here</p>
        <p className="mx-auto mt-1 max-w-sm text-sm text-niki-ink/55">{emptyHint}</p>
      </div>
    );
  }

  return (
    <>
      {notice ? (
        <p
          className={cn(
            "animate-fade-up mb-3 flex items-start gap-2 rounded-xl px-3.5 py-3 text-sm font-medium",
            notice.ok
              ? "bg-niki-success/10 text-niki-success"
              : "bg-niki-danger/10 text-niki-danger",
          )}
        >
          {notice.ok ? (
            <Check className="mt-0.5 h-4 w-4 shrink-0" />
          ) : (
            <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" />
          )}
          <span>{notice.message}</span>
        </p>
      ) : null}

      <div className="-mx-5 overflow-x-auto px-5">
        <table className="w-full min-w-[1020px] border-separate border-spacing-0 text-sm">
          <thead>
            <tr className="bg-niki-surface/70">
              <th className={`${th} rounded-l-lg`}>When</th>
              <th className={th}>Order</th>
              <th className={th}>Agent</th>
              <th className={th}>Destination</th>
              <th className={th}>Sent to</th>
              <th className={`${th} text-right`}>Amount</th>
              <th className={th}>State</th>
              <th className={`${th} rounded-r-lg text-right`}>Action</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr
                key={r.id}
                className="border-b border-niki-edge transition-colors last:border-0 hover:bg-niki-surface/50"
              >
                <td className={`${td} whitespace-nowrap text-xs font-semibold text-niki-ink/70`}>
                  {formatWhen(new Date(r.createdAt))}
                </td>
                <td className={td}>
                  <span className="block font-mono text-xs font-semibold text-niki-ink">
                    {r.reference}
                  </span>
                  <span className="block text-[11px] text-niki-ink/45">
                    {r.network
                      ? `${bundleLabel(r.sizeGb)} ${networkLabel(r.network)} · ${r.recipientPhone}`
                      : r.recipientPhone}
                  </span>
                </td>
                <td className={td}>
                  <span className="block text-niki-ink/80">{r.agentName}</span>
                  {r.agentCode ? (
                    <span className="block font-mono text-[11px] text-niki-ink/40">
                      {r.agentCode}
                    </span>
                  ) : null}
                </td>
                <td className={td}>
                  <DestinationPill destination={r.destination} />
                </td>
                <td className={td}>
                  {r.destination === "BUYER_MOMO" ? (
                    <>
                      <span className="block font-mono text-xs text-niki-ink/80">
                        {r.momoPhone}
                      </span>
                      <span className="block text-[11px] text-niki-ink/45">
                        {[r.momoName, r.momoNetwork].filter(Boolean).join(" · ")}
                      </span>
                    </>
                  ) : (
                    <span className="text-xs text-niki-ink/40">—</span>
                  )}
                </td>
                <td className={`${td} whitespace-nowrap text-right font-figures font-bold text-niki-danger`}>
                  {formatMoney(r.amount)}
                </td>
                <td className={td}>
                  <StatePill status={r.status} />
                  <span className="mt-1 block text-[11px] text-niki-ink/40">
                    {r.status === "settled" && r.paidBy
                      ? `Sent by ${r.paidBy}`
                      : `By ${r.requestedByName || r.requestedBy}`}
                  </span>
                </td>
                <td className={`${td} text-right`}>
                  {r.status === "pending" ? (
                    <button
                      type="button"
                      disabled={busy !== null}
                      onClick={() => send(r.id)}
                      className="niki-press niki-focus inline-flex items-center gap-1.5 rounded-full bg-niki-black px-3.5 py-2 text-xs font-semibold text-white disabled:opacity-60"
                    >
                      {busy === r.id ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <Send className="h-3.5 w-3.5" />
                      )}
                      Mark sent
                    </button>
                  ) : (
                    <span className="text-xs text-niki-ink/35">
                      {r.paidAt ? formatWhen(new Date(r.paidAt)) : "—"}
                    </span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
