import { CornerDownRight, Users } from "lucide-react";
import { ActionLink } from "@/components/ui/motion";
import { formatMoney } from "@/lib/format";
import type { MemberActivity } from "@/lib/data-bundles/team/rules";
import { cn } from "@/lib/cn";

/**
 * The team as a shape rather than a ranking.
 *
 * The table answers "who is selling"; this answers "who brought in whom",
 * which is the question a leader asks when they are deciding where to put
 * their effort. A recruit with three of their own under them is worth a
 * different conversation from one with none, and a list sorted by sales hides
 * that entirely.
 *
 * Two levels, so nesting rather than an expandable tree: everything fits on
 * the screen at once, and a control that only ever opens one depth is a
 * control that should not exist.
 */

export interface TreeNode {
  id: string;
  code: string;
  storeName: string;
  level: 1 | 2;
  recruitedById: string | null;
  activity: MemberActivity;
  sales: number;
  income: number;
  teamSize: number;
}

const DOT: Record<MemberActivity, string> = {
  active: "bg-niki-success",
  quiet: "bg-amber-400",
  dormant: "bg-niki-ink/25",
  never: "bg-niki-trust",
};

function Node({ m, nested }: { m: TreeNode; nested?: boolean }) {
  return (
    <ActionLink
      href={`/agent/team/${m.id}`}
      className={cn(
        "niki-focus flex items-center gap-2.5 rounded-xl px-3 py-2.5 transition-colors hover:bg-niki-surface/70",
        nested && "bg-niki-surface/40",
      )}
    >
      {nested ? (
        <CornerDownRight className="h-3.5 w-3.5 shrink-0 text-niki-ink/25" />
      ) : (
        <span className={cn("h-2 w-2 shrink-0 rounded-full", DOT[m.activity])} />
      )}
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-semibold text-niki-ink">{m.storeName}</span>
        <span className="block truncate font-mono text-[11px] text-niki-ink/40">{m.code}</span>
      </span>
      <span className="shrink-0 text-right">
        <span className="block font-figures text-sm font-bold text-niki-ink">
          {formatMoney(m.sales)}
        </span>
        <span className="block text-[11px] text-niki-success">
          {formatMoney(m.income)} to you
        </span>
      </span>
    </ActionLink>
  );
}

export function TeamTree({
  leaderName,
  leaderCode,
  nodes,
  empty,
}: {
  leaderName: string;
  leaderCode: string;
  nodes: TreeNode[];
  empty: string;
}) {
  const direct = nodes.filter((n) => n.level === 1);
  const childrenOf = (id: string) => nodes.filter((n) => n.level === 2 && n.recruitedById === id);

  return (
    <div>
      <div className="flex items-center gap-2.5 rounded-xl bg-niki-black px-3 py-2.5 text-white">
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-white/10 text-niki-orange">
          <Users className="h-4 w-4" />
        </span>
        <span className="min-w-0">
          <span className="block truncate text-sm font-bold">{leaderName}</span>
          <span className="block truncate font-mono text-[11px] text-white/45">{leaderCode}</span>
        </span>
        <span className="ml-auto shrink-0 text-xs font-semibold text-white/55">You</span>
      </div>

      {direct.length === 0 ? (
        <p className="mt-3 rounded-xl bg-niki-surface px-4 py-8 text-center text-sm text-niki-ink/55">
          {empty}
        </p>
      ) : (
        <ul className="mt-2 space-y-1">
          {direct.map((m) => {
            const kids = childrenOf(m.id);
            return (
              <li key={m.id} className="border-l-2 border-niki-edge pl-3">
                <Node m={m} />
                {kids.length > 0 ? (
                  <ul className="mt-1 space-y-1 pl-4">
                    {kids.map((k) => (
                      <li key={k.id}>
                        <Node m={k} nested />
                      </li>
                    ))}
                  </ul>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
