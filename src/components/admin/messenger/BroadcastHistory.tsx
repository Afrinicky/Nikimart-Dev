import { Send } from "lucide-react";
import { formatWhen } from "@/components/agent/AgentUi";
import { cn } from "@/lib/cn";

/**
 * What has been sent to a group, and whether it arrived.
 *
 * Not a nicety. A broadcast costs money per recipient, arrives on a phone at
 * whatever hour it was sent, and cannot be recalled — so this is the only
 * record of what several thousand people were told, and the only place the
 * question "did it actually go?" has an answer.
 */

export interface HistoryRow {
  id: string;
  audienceLabel: string;
  channel: string;
  subject: string;
  body: string;
  recipients: number;
  delivered: number;
  failed: number;
  sentBy: string;
  createdAt: Date;
}

const CHANNELS: Record<string, string> = { sms: "Text", email: "Email", both: "Text and email" };

export function BroadcastHistory({ rows }: { rows: HistoryRow[] }) {
  return (
    <section className="rounded-2xl bg-white p-5 ring-1 ring-niki-edge">
      <div className="mb-4 flex items-center gap-2.5">
        <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-niki-orange/10 text-niki-orange">
          <Send className="h-4 w-4" />
        </span>
        <div>
          <h2 className="font-display font-bold text-niki-ink">What has been sent</h2>
          <p className="text-xs text-niki-ink/55">
            Every broadcast, with what went out and who sent it.
          </p>
        </div>
      </div>

      {rows.length === 0 ? (
        <p className="rounded-xl bg-niki-surface px-4 py-8 text-center text-sm text-niki-ink/55">
          Nothing has been broadcast yet.
        </p>
      ) : (
        <ul className="divide-y divide-niki-edge">
          {rows.map((b) => (
            <li key={b.id} className="py-4 first:pt-0 last:pb-0">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <p className="text-sm font-semibold text-niki-ink">
                  {b.audienceLabel}
                  <span className="ml-2 text-xs font-medium text-niki-ink/45">
                    {CHANNELS[b.channel] ?? b.channel}
                  </span>
                </p>
                <p className="text-xs text-niki-ink/45">
                  {formatWhen(b.createdAt)}
                  {b.sentBy ? ` · ${b.sentBy}` : ""}
                </p>
              </div>
              {b.subject ? (
                <p className="mt-1 text-xs font-medium text-niki-ink/60">{b.subject}</p>
              ) : null}
              <p className="mt-1.5 whitespace-pre-wrap rounded-xl bg-niki-surface px-4 py-3 text-sm text-niki-ink/75">
                {b.body}
              </p>
              <p className="mt-1.5 text-xs text-niki-ink/50">
                <span
                  className={cn(
                    "font-semibold",
                    b.delivered === 0 && b.recipients > 0
                      ? "text-niki-danger"
                      : b.failed > 0
                        ? "text-amber-700"
                        : "text-niki-success",
                  )}
                >
                  {b.delivered} of {b.recipients} reached
                </span>
                {b.failed > 0 ? ` · ${b.failed} could not be reached` : ""}
              </p>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
