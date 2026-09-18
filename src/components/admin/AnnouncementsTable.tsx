import { ChevronRight, Megaphone, Pin } from "lucide-react";
import { ActionLink } from "@/components/ui/motion";
import { formatWhen } from "@/components/agent/AgentUi";
import {
  announcementStatus,
  ANNOUNCEMENT_STATUS_LABELS,
  ANNOUNCEMENT_STATUS_TONES,
  audienceLabel,
  TONE_LABELS,
} from "@/lib/announcement-rules";
import { cn } from "@/lib/cn";

/**
 * Every notice ever written, newest first, pinned ones above.
 *
 * Status is worked out against the clock rather than read off a column, so
 * "Live" here means the same thing it means to the person who is supposed to
 * be reading it — which is the one property a broadcast list has to have.
 */

export interface AnnouncementRow {
  id: string;
  title: string;
  body: string;
  tone: string;
  audience: string;
  isActive: boolean;
  isPinned: boolean;
  publishAt: Date | null;
  expiresAt: Date | null;
  createdBy: string;
  createdAt: Date;
}

const th = "px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wide text-niki-ink/45";
const td = "px-4 py-3.5 align-middle";

export function AnnouncementsTable({
  rows,
  scope,
  basePath,
  emptyHint,
}: {
  rows: AnnouncementRow[];
  scope: "data" | "retail";
  basePath: string;
  emptyHint: string;
}) {
  if (rows.length === 0) {
    return (
      <div className="px-4 py-12 text-center">
        <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-niki-surface text-niki-ink/35">
          <Megaphone className="h-5 w-5" />
        </span>
        <p className="mt-3 font-display font-bold text-niki-ink">Nothing here</p>
        <p className="mx-auto mt-1 max-w-sm text-sm text-niki-ink/55">{emptyHint}</p>
      </div>
    );
  }

  return (
    <div className="-mx-5 overflow-x-auto px-5">
      <table className="w-full min-w-[900px] border-separate border-spacing-0 text-sm">
        <thead>
          <tr className="bg-niki-surface/70">
            <th className={`${th} rounded-l-lg`}>Title</th>
            <th className={th}>Audience</th>
            <th className={th}>Tone</th>
            <th className={th}>Status</th>
            <th className={th}>Showing</th>
            <th className={th}>Written</th>
            <th className={`${th} rounded-r-lg`}>By</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((n) => {
            const status = announcementStatus(n);
            return (
              <tr
                key={n.id}
                className="border-b border-niki-edge transition-colors last:border-0 hover:bg-niki-surface/50"
              >
                <td className={`${td} max-w-[22rem]`}>
                  <ActionLink
                    href={`${basePath}/${n.id}`}
                    className="flex items-center gap-1.5 font-semibold text-niki-trust hover:underline"
                  >
                    {n.isPinned ? (
                      <Pin className="h-3.5 w-3.5 shrink-0 text-niki-orange" />
                    ) : null}
                    <span className="truncate">{n.title}</span>
                    <ChevronRight className="h-3 w-3 shrink-0" />
                  </ActionLink>
                  <p className="mt-0.5 truncate text-xs text-niki-ink/50">
                    {n.body.replace(/\s+/g, " ")}
                  </p>
                </td>
                <td className={`${td} text-niki-ink/75`}>{audienceLabel(scope, n.audience)}</td>
                <td className={`${td} text-niki-ink/60`}>{TONE_LABELS[n.tone] ?? n.tone}</td>
                <td className={td}>
                  <span
                    className={cn(
                      "inline-flex whitespace-nowrap rounded-md px-2.5 py-1 text-[11px] font-semibold uppercase",
                      ANNOUNCEMENT_STATUS_TONES[status],
                    )}
                  >
                    {ANNOUNCEMENT_STATUS_LABELS[status]}
                  </span>
                </td>
                <td className={`${td} whitespace-nowrap text-xs text-niki-ink/55`}>
                  {n.publishAt || n.expiresAt ? (
                    <>
                      {n.publishAt ? formatWhen(n.publishAt) : "Now"}
                      <p className="text-[11px] text-niki-ink/40">
                        {n.expiresAt ? `until ${formatWhen(n.expiresAt)}` : "no end date"}
                      </p>
                    </>
                  ) : (
                    "Always"
                  )}
                </td>
                <td className={`${td} whitespace-nowrap text-xs text-niki-ink/55`}>
                  {formatWhen(n.createdAt)}
                </td>
                <td className={`${td} text-xs text-niki-ink/55`}>{n.createdBy || "—"}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
