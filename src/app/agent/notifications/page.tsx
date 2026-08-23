import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Bell, Pin } from "lucide-react";
import { ActionLink } from "@/components/ui/motion";
import { AgentPageHeading, EmptyRow, formatWhen } from "@/components/agent/AgentUi";
import { requireUser } from "@/lib/session";
import { getAgentForUser, getAnnouncements } from "@/lib/data-bundles/agents";
import { cn } from "@/lib/cn";

export const metadata: Metadata = { title: "Notifications — Agent — NikiMart" };
export const dynamic = "force-dynamic";

const TONES: Record<string, string> = {
  info: "bg-niki-trust/10 text-niki-trust ring-niki-trust/25",
  warning: "bg-niki-gold/15 text-amber-700 ring-niki-gold/40",
  success: "bg-niki-success/10 text-niki-success ring-niki-success/25",
};

export default async function AgentNotificationsPage() {
  const user = await requireUser();
  const agent = await getAgentForUser(user.id);
  if (!agent) redirect("/become-an-agent");

  const notices = await getAnnouncements();

  return (
    <div className="space-y-5">
      <AgentPageHeading title="Notifications" subtitle="Latest announcements and updates.">
        <ActionLink
          href="/agent/notifications"
          className="rounded-full bg-niki-navy px-4 py-2 text-xs font-semibold text-white"
        >
          Refresh
        </ActionLink>
      </AgentPageHeading>

      {notices.length === 0 ? (
        <EmptyRow>Nothing new. Announcements from NikiMart show up here.</EmptyRow>
      ) : (
        <div className="stagger-children space-y-3">
          {notices.map((n) => (
            <article key={n.id} className="rounded-2xl bg-white p-5 ring-1 ring-black/5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="flex items-center gap-2.5">
                  <span
                    className={cn(
                      "flex h-9 w-9 items-center justify-center rounded-xl ring-1",
                      TONES[n.tone] ?? TONES.info,
                    )}
                  >
                    {n.isPinned ? <Pin className="h-4 w-4" /> : <Bell className="h-4 w-4" />}
                  </span>
                  <h2 className="font-display font-bold uppercase tracking-wide text-niki-ink">
                    {n.title}
                  </h2>
                </div>
                <time className="text-xs text-niki-ink/45">{formatWhen(n.createdAt)}</time>
              </div>
              {/* Announcements are written by admins in plain text; blank lines
                  separate paragraphs. */}
              <div className="mt-3 space-y-2 text-sm leading-relaxed text-niki-ink/70">
                {n.body.split(/\n{2,}/).map((para, i) => (
                  <p key={i}>{para}</p>
                ))}
              </div>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}
