import { Award, Trophy, Users, Zap } from "lucide-react";
import { cn } from "@/lib/cn";
import type { Board, BoardRow } from "@/lib/data-bundles/leaderboard";
import { boardExcerpt, type BoardKey } from "@/lib/data-bundles/leaderboard-rules";

/**
 * The leaderboard, drawn.
 *
 * The whole screen is one idea: where am I, and who is just ahead of me. So
 * the agent's own row is never off the board — it is highlighted where it
 * falls, and pinned in on its own when it falls outside what is shown — and
 * every row carries the one number they can move by selling something today.
 *
 * The medal for the top three is a ring, not a picture: it colours the place
 * without adding a graphic to load, and it reads the same at 360px as it does
 * on a desktop.
 */

export const BOARD_ICON: Record<BoardKey, React.ElementType> = {
  SALES: Trophy,
  RECRUITS: Users,
  PERFORMANCE: Zap,
};

/** The place badge. Gold, silver and bronze for the podium; plain after that. */
export function RankBadge({ rank, size = "md" }: { rank: number; size?: "sm" | "md" }) {
  const podium: Record<number, string> = {
    1: "bg-niki-gold/20 text-[#8a5a00] ring-niki-gold/60",
    2: "bg-niki-ink/10 text-niki-ink/70 ring-niki-ink/25",
    3: "bg-niki-orange/15 text-niki-orange ring-niki-orange/40",
  };
  return (
    <span
      aria-hidden
      className={cn(
        "inline-flex shrink-0 items-center justify-center rounded-full font-figures font-bold ring-1",
        size === "sm" ? "h-7 w-7 text-xs" : "h-9 w-9 text-sm",
        podium[rank] ?? "bg-niki-surface text-niki-ink/50 ring-niki-edge",
      )}
    >
      {rank}
    </span>
  );
}

/** "Excellent" / "Exceptional" on the performance board. */
export function GradePill({ grade }: { grade: "EXCELLENT" | "EXCEPTIONAL" }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide",
        grade === "EXCEPTIONAL"
          ? "bg-niki-gold/20 text-[#8a5a00]"
          : "bg-niki-success/10 text-niki-success",
      )}
    >
      <Award className="h-3 w-3" />
      {grade === "EXCEPTIONAL" ? "Exceptional" : "Excellent"}
    </span>
  );
}

/** One line of a board. */
export function LeaderRow({
  row,
  unit,
  compact = false,
}: {
  row: BoardRow;
  unit: string;
  compact?: boolean;
}) {
  return (
    <li
      className={cn(
        "flex items-center gap-3 rounded-xl px-3 py-2.5",
        row.isYou ? "bg-niki-orange/10 ring-1 ring-niki-orange/35" : "hover:bg-niki-surface/70",
      )}
    >
      <RankBadge rank={row.rank} size={compact ? "sm" : "md"} />
      <div className="min-w-0 flex-1">
        <p className="flex items-center gap-2 truncate text-sm font-semibold text-niki-ink">
          <span className="truncate">{row.isYou ? "You" : row.storeName}</span>
          {row.isYou ? (
            <span className="shrink-0 rounded-full bg-niki-orange px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white">
              You
            </span>
          ) : null}
        </p>
        <p className="flex items-center gap-2 truncate text-[11px] text-niki-ink/45">
          <span className="font-mono">{row.code}</span>
          {row.grade ? <GradePill grade={row.grade} /> : null}
        </p>
      </div>
      <div className="shrink-0 text-right">
        <p className="font-figures text-base font-bold text-niki-ink">{row.score}</p>
        <p className="text-[10px] uppercase tracking-wide text-niki-ink/40">{unit}</p>
      </div>
    </li>
  );
}

/**
 * A whole board.
 *
 * `limit` cuts it to the podium for the dashboard; the agent's own row is
 * added underneath whenever the cut would have hidden it, with a divider so
 * it is clear the two are not adjacent places.
 */
export function BoardCard({
  board,
  limit,
  className,
}: {
  board: Board;
  limit?: number;
  className?: string;
}) {
  const Icon = BOARD_ICON[board.key];
  // Cut down, the board is the podium plus the rows either side of the
  // viewer — so the gap they are trying to close is visible rather than
  // abstract. Uncut, it is simply the whole board.
  const { top: shown, near: neighbours } = limit
    ? boardExcerpt(board.rows, board.you?.agentId ?? null, limit, 1)
    : { top: board.rows, near: [] as BoardRow[] };

  return (
    <section className={cn("rounded-2xl bg-white p-4 ring-1 ring-niki-edge sm:p-5", className)}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-niki-orange/10 text-niki-orange">
            <Icon className="h-4.5 w-4.5" />
          </span>
          <div>
            <h3 className="font-display font-bold text-niki-ink">{board.title}</h3>
            <p className="text-[11px] text-niki-ink/50">{board.periodLabel}</p>
          </div>
        </div>
        {board.you ? (
          <span className="shrink-0 rounded-full bg-niki-surface px-3 py-1 text-[11px] font-bold text-niki-ink/70">
            You are #{board.you.rank}
          </span>
        ) : null}
      </div>

      {shown.length === 0 ? (
        <p className="mt-4 rounded-xl bg-niki-surface px-4 py-8 text-center text-sm text-niki-ink/55">
          {board.note ?? "Nobody is on this board yet. Be the first."}
        </p>
      ) : (
        <>
          <ul className="mt-3 space-y-1">
            {shown.map((row) => (
              <LeaderRow key={row.agentId} row={row} unit={board.unit} compact={Boolean(limit)} />
            ))}
          </ul>

          {neighbours.length > 0 ? (
            <>
              <p className="my-2 text-center text-xs tracking-[0.3em] text-niki-ink/25">···</p>
              <ul className="space-y-1">
                {neighbours.map((row) => (
                  <LeaderRow key={row.agentId} row={row} unit={board.unit} compact={Boolean(limit)} />
                ))}
              </ul>
            </>
          ) : null}

          {!board.you && board.note ? (
            <p className="mt-3 rounded-xl bg-niki-surface px-3 py-2.5 text-xs text-niki-ink/60">
              {board.note}
            </p>
          ) : null}
        </>
      )}
    </section>
  );
}
