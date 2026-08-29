import type { Metadata } from "next";
import { Megaphone, Pin, Trash2 } from "lucide-react";
import { Container } from "@/components/ui/Container";
import { AnnouncementForm } from "@/components/admin/AgentAdminTools";
import { formatWhen } from "@/components/agent/AgentUi";
import { prisma } from "@/lib/prisma";
import {
  deleteAnnouncement,
  setAnnouncementActive,
} from "@/lib/data-bundles/agent-admin-actions";
import { cn } from "@/lib/cn";

export const metadata: Metadata = { title: "Announcements — Admin — Nickimart" };
export const dynamic = "force-dynamic";

const TONES: Record<string, string> = {
  info: "bg-niki-trust/10 text-niki-trust ring-niki-trust/25",
  warning: "bg-niki-gold/15 text-amber-700 ring-niki-gold/40",
  success: "bg-niki-success/10 text-niki-success ring-niki-success/25",
};

/** What every agent sees on their Notifications screen. */
export default async function AdminAnnouncementsPage() {
  const notices = await prisma.dataAnnouncement
    .findMany({ orderBy: [{ isPinned: "desc" }, { createdAt: "desc" }], take: 50 })
    .catch(() => []);

  return (
    <Container className="py-8">
      <div>
        <h1 className="font-display text-2xl font-bold text-niki-ink">Announcements</h1>
        <p className="mt-1 text-sm text-niki-ink/60">
          Broadcast to every agent. They appear under Notifications in the agent platform.
        </p>
      </div>

      <div className="mt-6 grid gap-4 lg:grid-cols-[380px_minmax(0,1fr)]">
        <div className="lg:sticky lg:top-6 lg:self-start">
          <AnnouncementForm />
        </div>

        <div className="space-y-3">
          {notices.length === 0 ? (
            <div className="rounded-2xl bg-white px-4 py-12 text-center ring-1 ring-niki-edge">
              <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-niki-surface text-niki-ink/35">
                <Megaphone className="h-5 w-5" />
              </span>
              <p className="mt-3 font-display font-bold text-niki-ink">Nothing published yet</p>
            </div>
          ) : (
            notices.map((n) => (
              <article
                key={n.id}
                className={cn(
                  "rounded-2xl bg-white p-5 ring-1 ring-niki-edge",
                  !n.isActive && "opacity-60",
                )}
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="flex items-center gap-2.5">
                    <span
                      className={cn(
                        "flex h-9 w-9 items-center justify-center rounded-xl ring-1",
                        TONES[n.tone] ?? TONES.info,
                      )}
                    >
                      {n.isPinned ? <Pin className="h-4 w-4" /> : <Megaphone className="h-4 w-4" />}
                    </span>
                    <div>
                      <h2 className="font-display font-bold uppercase text-niki-ink">{n.title}</h2>
                      <p className="text-[11px] text-niki-ink/45">
                        {formatWhen(n.createdAt)}
                        {n.isActive ? "" : " · hidden"}
                      </p>
                    </div>
                  </div>

                  <div className="flex gap-2">
                    <form action={setAnnouncementActive}>
                      <input type="hidden" name="id" value={n.id} />
                      <input type="hidden" name="isActive" value={n.isActive ? "0" : "1"} />
                      <button
                        type="submit"
                        className="niki-press rounded-full bg-niki-surface px-3 py-1.5 text-[11px] font-bold text-niki-ink/65"
                      >
                        {n.isActive ? "Hide" : "Show"}
                      </button>
                    </form>
                    <form action={deleteAnnouncement}>
                      <input type="hidden" name="id" value={n.id} />
                      <button
                        type="submit"
                        aria-label={`Delete ${n.title}`}
                        className="niki-press rounded-full p-1.5 text-niki-ink/40 hover:bg-niki-danger/10 hover:text-niki-danger"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </form>
                  </div>
                </div>

                <div className="mt-3 space-y-2 text-sm leading-relaxed text-niki-ink/70">
                  {n.body.split(/\n{2,}/).map((para, i) => (
                    <p key={i}>{para}</p>
                  ))}
                </div>
              </article>
            ))
          )}
        </div>
      </div>
    </Container>
  );
}
