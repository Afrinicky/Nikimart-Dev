"use client";

import { useEffect, useSyncExternalStore } from "react";
import { X } from "lucide-react";
import { seenAnnouncements } from "@/components/agent/announcements-seen";
import { overlayBusy } from "@/components/agent/overlay-busy";
import { cn } from "@/lib/cn";

/**
 * Announcements, in front of the agent instead of behind a bell.
 *
 * A notice that changes how commission is paid, or what to do about a queued
 * order, is not something to leave on a Notifications screen and hope somebody
 * opens. It appears the moment they land, they acknowledge it, and it never
 * interrupts them again — dismissal is remembered per announcement, not per
 * session, so "Got it" means it.
 *
 * Several unseen notices queue rather than stack: one at a time, oldest first,
 * because two modals over each other is how people dismiss both without
 * reading either.
 */

export interface PopupAnnouncement {
  id: string;
  title: string;
  body: string;
  tone: string;
  createdAt: string;
}

const TONE_RING: Record<string, string> = {
  info: "bg-niki-trust",
  warning: "bg-niki-gold",
  success: "bg-niki-success",
};

function formatWhen(iso: string): string {
  return new Date(iso).toLocaleString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function AnnouncementPopup({ announcements }: { announcements: PopupAnnouncement[] }) {
  const seen = useSyncExternalStore(
    seenAnnouncements.subscribe,
    seenAnnouncements.get,
    seenAnnouncements.empty,
  );
  const queue = announcements.filter((a) => !seen.includes(a.id));
  const current = queue[0] ?? null;

  // Escape dismisses, the page behind must not scroll under the sheet, and
  // anything else that wants the screen — the walkthrough — waits until this
  // has been acknowledged.
  useEffect(() => {
    if (!current) return;
    overlayBusy.set("announcement", true);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") seenAnnouncements.markSeen(current.id);
    };
    document.addEventListener("keydown", onKey);
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = previous;
      overlayBusy.set("announcement", false);
    };
  }, [current]);

  if (!current) return null;

  const dismiss = () => seenAnnouncements.markSeen(current.id);

  return (
    <div className="animate-fade-in fixed inset-0 z-[60] flex items-center justify-center bg-niki-black/70 p-4 backdrop-blur-sm">
      <button type="button" aria-label="Close" className="absolute inset-0" onClick={dismiss} />
      {/* A card in the middle at every width, not a sheet stuck to the bottom
          edge. A long notice grows downwards and then scrolls inside itself, so
          it gets taller than it is wide rather than taking the whole screen. */}
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="announcement-title"
        className="animate-scale-in relative z-10 flex max-h-[85dvh] w-full max-w-lg flex-col overflow-hidden rounded-3xl bg-white shadow-2xl"
      >
        <div className="flex items-center justify-between gap-4 border-b border-niki-edge px-5 py-4">
          <p className="font-display text-lg font-bold text-niki-ink">Announcement</p>
          <button
            type="button"
            onClick={dismiss}
            aria-label="Close"
            className="niki-press niki-focus rounded-lg p-1.5 text-niki-ink/40 hover:bg-niki-surface hover:text-niki-ink"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5">
          <div className="flex items-start gap-3">
            <span
              aria-hidden
              className={cn("mt-1.5 h-2 w-2 shrink-0 rounded-full", TONE_RING[current.tone] ?? TONE_RING.info)}
            />
            <div className="min-w-0">
              <h2
                id="announcement-title"
                className="font-display text-base font-bold uppercase text-niki-ink"
              >
                {current.title}
              </h2>
              <p className="mt-0.5 text-xs text-niki-ink/45">{formatWhen(current.createdAt)}</p>
            </div>
          </div>

          {/* The admin writes plain text with line breaks; keep them. */}
          <p className="mt-4 whitespace-pre-wrap text-sm leading-relaxed text-niki-ink/75">
            {current.body}
          </p>

          {queue.length > 1 ? (
            <p className="mt-4 text-xs font-medium text-niki-ink/45">
              {queue.length - 1} more {queue.length - 1 === 1 ? "notice" : "notices"} after this
            </p>
          ) : null}
        </div>

        <div className="flex justify-end border-t border-niki-edge px-5 py-4">
          <button
            type="button"
            onClick={dismiss}
            className="niki-press niki-focus rounded-xl bg-niki-black px-6 py-2.5 text-sm font-bold text-white"
          >
            Got it
          </button>
        </div>
      </div>
    </div>
  );
}

/** The unread count for the bell, from the same seen-state the pop-up writes. */
export function useUnreadAnnouncements(ids: string[]): number {
  const seen = useSyncExternalStore(
    seenAnnouncements.subscribe,
    seenAnnouncements.get,
    seenAnnouncements.empty,
  );
  return ids.filter((id) => !seen.includes(id)).length;
}
