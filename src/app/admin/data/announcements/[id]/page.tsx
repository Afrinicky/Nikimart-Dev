import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ArrowLeft, Eye, EyeOff, Megaphone, Pin, PinOff, Trash2 } from "lucide-react";
import { Container } from "@/components/ui/Container";
import { ActionLink } from "@/components/ui/motion";
import { AnnouncementComposer } from "@/components/admin/AnnouncementComposer";
import { formatWhen } from "@/components/agent/AgentUi";
import { getAnnouncement } from "@/lib/data-bundles/announcements";
import {
  announcementStatus,
  ANNOUNCEMENT_STATUS_LABELS,
  ANNOUNCEMENT_STATUS_TONES,
  audienceLabel,
  TONE_LABELS,
} from "@/lib/announcement-rules";
import {
  deleteAnnouncement,
  setAnnouncementActive,
  setAnnouncementPinned,
} from "@/lib/announcement-actions";
import { cn } from "@/lib/cn";

export const metadata: Metadata = { title: "Announcement — Admin — Nickimart" };
export const dynamic = "force-dynamic";

function Line({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-4 border-b border-niki-edge py-2.5 last:border-0">
      <dt className="shrink-0 text-sm text-niki-ink/55">{label}</dt>
      <dd className="min-w-0 truncate text-right text-sm font-medium text-niki-ink">{value}</dd>
    </div>
  );
}

/**
 * One announcement: what it says, who it reaches, and whether it is reaching
 * them right now.
 *
 * The preview is the point. A notice is written in a box and read on somebody
 * else's screen, and the gap between those two is where a broadcast goes
 * wrong — so this shows it as the reader will see it, beside the editor.
 */
export default async function AdminDataAnnouncementPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const notice = await getAnnouncement(id);
  if (!notice) notFound();

  const status = announcementStatus(notice);

  return (
    <Container className="py-8">
      <ActionLink
        href="/admin/data/announcements"
        className="inline-flex items-center gap-1.5 text-sm font-semibold text-niki-ink/60 hover:text-niki-orange"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to announcements
      </ActionLink>

      <div className="mt-4 flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="font-display text-2xl font-bold text-niki-ink">{notice.title}</h1>
            <span
              className={cn(
                "rounded-md px-2 py-0.5 text-[10px] font-bold uppercase",
                ANNOUNCEMENT_STATUS_TONES[status],
              )}
            >
              {ANNOUNCEMENT_STATUS_LABELS[status]}
            </span>
          </div>
          <p className="mt-1 text-sm text-niki-ink/60">
            To {audienceLabel("data", notice.audience).toLowerCase()} · written{" "}
            {formatWhen(notice.createdAt)}
            {notice.createdBy ? ` by ${notice.createdBy}` : ""}
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          <form action={setAnnouncementPinned}>
            <input type="hidden" name="scope" value="data" />
            <input type="hidden" name="id" value={notice.id} />
            <input type="hidden" name="isPinned" value={notice.isPinned ? "0" : "1"} />
            <button
              type="submit"
              className="niki-press niki-chip flex items-center gap-1.5 rounded-lg px-4 py-2 text-xs font-semibold text-niki-ink/75"
            >
              {notice.isPinned ? <PinOff className="h-3.5 w-3.5" /> : <Pin className="h-3.5 w-3.5" />}
              {notice.isPinned ? "Unpin" : "Pin to top"}
            </button>
          </form>
          <form action={setAnnouncementActive}>
            <input type="hidden" name="scope" value="data" />
            <input type="hidden" name="id" value={notice.id} />
            <input type="hidden" name="isActive" value={notice.isActive ? "0" : "1"} />
            <button
              type="submit"
              className="niki-press niki-chip flex items-center gap-1.5 rounded-lg px-4 py-2 text-xs font-semibold text-niki-ink/75"
            >
              {notice.isActive ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
              {notice.isActive ? "Hide" : "Show"}
            </button>
          </form>
          <form action={deleteAnnouncement}>
            <input type="hidden" name="scope" value="data" />
            <input type="hidden" name="id" value={notice.id} />
            <button
              type="submit"
              className="niki-press flex items-center gap-1.5 rounded-lg bg-white px-4 py-2 text-xs font-semibold text-niki-danger ring-1 ring-niki-danger/30"
            >
              <Trash2 className="h-3.5 w-3.5" />
              Delete
            </button>
          </form>
        </div>
      </div>

      <div className="mt-6 grid gap-4 lg:grid-cols-[minmax(0,1fr)_380px]">
        <AnnouncementComposer
          scope="data"
          initial={{
            id: notice.id,
            title: notice.title,
            body: notice.body,
            tone: notice.tone,
            audience: notice.audience,
            isPinned: notice.isPinned,
            isActive: notice.isActive,
            publishAt: notice.publishAt,
            expiresAt: notice.expiresAt,
          }}
        />

        <div className="space-y-4">
          <section className="rounded-2xl bg-white p-5 ring-1 ring-niki-edge">
            <div className="mb-3 flex items-center gap-2.5">
              <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-niki-orange/10 text-niki-orange">
                <Megaphone className="h-4 w-4" />
              </span>
              <div>
                <h2 className="font-display font-bold text-niki-ink">As they&apos;ll see it</h2>
                <p className="text-xs text-niki-ink/55">The notice on a reader&apos;s screen.</p>
              </div>
            </div>

            <div className="rounded-2xl bg-niki-surface p-4">
              <div className="flex items-start gap-2.5">
                <span
                  aria-hidden
                  className={cn(
                    "mt-1.5 h-2 w-2 shrink-0 rounded-full",
                    notice.tone === "warning"
                      ? "bg-niki-gold"
                      : notice.tone === "success"
                        ? "bg-niki-success"
                        : "bg-niki-trust",
                  )}
                />
                <div className="min-w-0">
                  <p className="font-display text-sm font-bold uppercase text-niki-ink">
                    {notice.title}
                  </p>
                  <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-niki-ink/75">
                    {notice.body}
                  </p>
                </div>
              </div>
            </div>
          </section>

          <section className="rounded-2xl bg-white p-5 ring-1 ring-niki-edge">
            <h2 className="mb-2 font-display font-bold text-niki-ink">Details</h2>
            <dl>
              <Line label="Audience" value={audienceLabel("data", notice.audience)} />
              <Line label="Tone" value={TONE_LABELS[notice.tone] ?? notice.tone} />
              <Line label="Status" value={ANNOUNCEMENT_STATUS_LABELS[status]} />
              <Line label="Pinned" value={notice.isPinned ? "Yes" : "No"} />
              <Line
                label="Starts"
                value={notice.publishAt ? formatWhen(notice.publishAt) : "Immediately"}
              />
              <Line
                label="Ends"
                value={notice.expiresAt ? formatWhen(notice.expiresAt) : "When hidden"}
              />
              <Line label="Written" value={formatWhen(notice.createdAt)} />
              <Line label="By" value={notice.createdBy || "—"} />
            </dl>
          </section>
        </div>
      </div>
    </Container>
  );
}
