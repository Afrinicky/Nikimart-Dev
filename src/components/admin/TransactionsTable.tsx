import { ChevronRight, Receipt } from "lucide-react";
import { ActionLink } from "@/components/ui/motion";
import { formatWhen } from "@/components/agent/AgentUi";
import { formatMoney } from "@/lib/format";
import { flowTone, kindLabel, type Flow } from "@/lib/transaction-kinds";
import { cn } from "@/lib/cn";

/**
 * The transactions table, shared by both consoles.
 *
 * The rows come from different databases and never mix, but the questions
 * asked of them are the same, so the table is one component: when, what kind,
 * which way the money went, who it involved, how much, and a way through to
 * the thing itself.
 *
 * The amount is signed rather than colour-coded alone — a minus sign survives
 * a monochrome print, a screenshot and a colour-blind reader, and the tone
 * beside it is a second channel rather than the only one.
 */

export interface TransactionTableRow {
  id: string;
  kind: string;
  flow: Flow;
  amount: number;
  reference: string;
  party: string;
  detail: string;
  status: string;
  createdAt: Date;
  href: string;
}

const th = "px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wide text-niki-ink/45";
const td = "px-4 py-3.5 align-middle";

export function TransactionsTable({
  rows,
  emptyHint,
}: {
  rows: TransactionTableRow[];
  emptyHint: string;
}) {
  if (rows.length === 0) {
    return (
      <div className="px-4 py-12 text-center">
        <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-niki-surface text-niki-ink/35">
          <Receipt className="h-5 w-5" />
        </span>
        <p className="mt-3 font-display font-bold text-niki-ink">Nothing here</p>
        <p className="mx-auto mt-1 max-w-sm text-sm text-niki-ink/55">{emptyHint}</p>
      </div>
    );
  }

  return (
    <div className="-mx-5 overflow-x-auto px-5">
      <table className="w-full min-w-[920px] border-separate border-spacing-0 text-sm">
        <thead>
          <tr className="bg-niki-surface/70">
            <th className={`${th} rounded-l-lg`}>When</th>
            <th className={th}>Kind</th>
            <th className={th}>Reference</th>
            <th className={th}>Who</th>
            <th className={th}>Detail</th>
            <th className={`${th} text-right`}>Amount</th>
            <th className={`${th} rounded-r-lg`}>Status</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr
              key={`${r.kind}-${r.id}`}
              className="border-b border-niki-edge transition-colors last:border-0 hover:bg-niki-surface/50"
            >
              <td className={td}>
                <ActionLink
                  href={r.href}
                  className="flex items-center gap-1.5 whitespace-nowrap text-xs font-semibold text-niki-trust hover:underline"
                >
                  {formatWhen(r.createdAt)}
                  <ChevronRight className="h-3 w-3" />
                </ActionLink>
              </td>
              <td className={td}>
                <span
                  className={cn(
                    "inline-flex whitespace-nowrap rounded-md px-2.5 py-1 text-[11px] font-semibold",
                    flowTone(r.flow),
                  )}
                >
                  {kindLabel(r.kind)}
                </span>
              </td>
              <td className={`${td} font-mono text-xs text-niki-ink/70`}>{r.reference}</td>
              <td className={`${td} text-niki-ink/80`}>{r.party}</td>
              <td className={`${td} max-w-[18rem] truncate text-xs text-niki-ink/55`}>
                {r.detail}
              </td>
              <td
                className={cn(
                  td,
                  "whitespace-nowrap text-right font-figures font-bold",
                  r.flow === "out" ? "text-niki-danger" : "text-niki-ink",
                )}
              >
                {r.flow === "out" ? "−" : "+"}
                {formatMoney(Math.abs(r.amount))}
              </td>
              <td className={`${td} text-xs uppercase text-niki-ink/55`}>{r.status}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
