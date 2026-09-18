import type { Metadata } from "next";
import { Megaphone, Send } from "lucide-react";
import { Container } from "@/components/ui/Container";
import { ModuleHeader } from "@/components/admin/ModuleHeader";
import { ModuleTabs } from "@/components/admin/ModuleTabs";
import { BroadcastComposer } from "@/components/admin/BroadcastComposer";
import { formatWhen } from "@/components/agent/AgentUi";
import { ANNOUNCEMENT_MODULE_TABS } from "@/lib/announcement-module";
import { audienceLabel, broadcastAudiences, listBroadcasts } from "@/lib/broadcasts";
import { cn } from "@/lib/cn";

export const metadata: Metadata = { title: "Broadcasts — Admin — Nickimart" };
export const dynamic = "force-dynamic";

const CHANNELS: Record<string, string> = { sms: "Text", email: "Email", both: "Text and email" };

/**
 * Sending something to a group of people on purpose.
 *
 * The difference from an announcement is worth keeping in mind while writing
 * one: an announcement waits on a screen, a broadcast arrives on a phone at
 * whatever hour it was sent, costs money per recipient, and cannot be
 * recalled. So the history below is not a nicety — it is the only record of
 * what several thousand people were told.
 */
export default async function AdminRetailBroadcastsPage() {
  const sent = await listBroadcasts("retail");

  return (
    <Container className="py-8">
      <ModuleHeader
        title="Announcements"
        subtitle="What Nickimart says to people: on their screen, when something happens, and on purpose."
        icon={Megaphone}
      />
      <div className="mt-5">
        <ModuleTabs tabs={ANNOUNCEMENT_MODULE_TABS("retail")} />
      </div>

      <div className="mt-6">
        <BroadcastComposer scope="retail" audiences={broadcastAudiences("retail")} />
      </div>

      <section className="mt-6 rounded-2xl bg-white p-5 ring-1 ring-niki-edge">
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

        {sent.length === 0 ? (
          <p className="rounded-xl bg-niki-surface px-4 py-8 text-center text-sm text-niki-ink/55">
            Nothing has been broadcast yet.
          </p>
        ) : (
          <ul className="divide-y divide-niki-edge">
            {sent.map((b) => (
              <li key={b.id} className="py-4 first:pt-0 last:pb-0">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <p className="text-sm font-semibold text-niki-ink">
                    {audienceLabel("retail", b.audience)}
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
    </Container>
  );
}
