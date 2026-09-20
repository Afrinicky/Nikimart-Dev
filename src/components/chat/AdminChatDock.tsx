"use client";

import { useEffect, useState } from "react";
import { ArrowLeft, Headphones, Phone, X } from "lucide-react";
import { ActionLink } from "@/components/ui/motion";
import { ChatRoom, type RoomMessage } from "@/components/chat/ChatRoom";
import type { DockEnquiry } from "@/lib/chat/inbox";
import { cn } from "@/lib/cn";

/**
 * Enquiries, wherever the admin happens to be standing.
 *
 * An enquiry is somebody waiting, and the console is a place people spend an
 * hour at a time on one screen. Sending them to an inbox tab to find that out
 * means finding out late — so the count follows them, and the reply happens
 * where they are rather than three clicks away.
 *
 * One panel, two depths: the list, and the conversation. Deliberately not a
 * stack of windows — a screen of overlapping chat boxes is how the important
 * one gets closed by accident.
 */
export function AdminChatDock({
  enquiries,
  me,
}: {
  enquiries: DockEnquiry[];
  me: { key: string; name: string };
}) {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState<DockEnquiry | null>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      if (active) setActive(null);
      else setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, active]);

  const waiting = enquiries.reduce((sum, e) => sum + e.unread, 0);

  return (
    <>
      {open ? (
        <div className="animate-fade-up fixed bottom-[5.5rem] right-4 z-[80] flex h-[min(32rem,calc(100dvh-8rem))] w-[min(24rem,calc(100vw-2rem))] flex-col overflow-hidden rounded-3xl bg-niki-surface shadow-2xl ring-1 ring-niki-edge">
          <div className="flex items-center gap-2.5 bg-niki-black px-4 py-3.5 text-white">
            {active ? (
              <button
                type="button"
                onClick={() => setActive(null)}
                aria-label="Back to enquiries"
                className="niki-press niki-focus -ml-1.5 rounded-lg p-1.5 text-white/60 hover:bg-white/10 hover:text-white"
              >
                <ArrowLeft className="h-5 w-5" />
              </button>
            ) : null}
            <div className="min-w-0 flex-1">
              <p className="truncate font-display text-sm font-bold">
                {active ? active.visitorName || "Enquiry" : "Enquiries"}
              </p>
              {active?.visitorPhone ? (
                <a
                  href={`tel:${active.visitorPhone}`}
                  className="flex items-center gap-1 font-mono text-[11px] text-niki-gold hover:underline"
                >
                  <Phone className="h-3 w-3" />
                  {active.visitorPhone}
                </a>
              ) : (
                <p className="text-[11px] text-white/55">
                  {enquiries.length} open{waiting > 0 ? ` · ${waiting} unread` : ""}
                </p>
              )}
            </div>
            <button
              type="button"
              onClick={() => setOpen(false)}
              aria-label="Close"
              className="niki-press niki-focus rounded-lg p-1.5 text-white/60 hover:bg-white/10 hover:text-white"
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          {active ? (
            <ChatRoom
              conversationId={active.id}
              me={me}
              history={[] as RoomMessage[]}
              placeholder="Reply…"
              className="min-h-0 flex-1"
            />
          ) : enquiries.length === 0 ? (
            <p className="flex min-h-0 flex-1 items-center justify-center px-6 text-center text-sm text-niki-ink/50">
              Nobody is waiting. Enquiries from the site land here.
            </p>
          ) : (
            <ul className="min-h-0 flex-1 space-y-1 overflow-y-auto p-2">
              {enquiries.map((e) => (
                <li key={e.id}>
                  <button
                    type="button"
                    onClick={() => setActive(e)}
                    className={cn(
                      "niki-focus flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition-colors hover:bg-white",
                      e.unread > 0 && "bg-white ring-1 ring-niki-orange/30",
                    )}
                  >
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-amber-100 text-amber-700">
                      <Headphones className="h-4 w-4" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span
                        className={cn(
                          "block truncate text-sm",
                          e.unread > 0 ? "font-bold text-niki-ink" : "font-semibold text-niki-ink/80",
                        )}
                      >
                        {e.visitorName || "Someone"}
                      </span>
                      <span className="block truncate text-xs text-niki-ink/50">
                        {e.preview || "No messages yet"}
                      </span>
                    </span>
                    {e.unread > 0 ? (
                      <span className="flex h-5 min-w-[20px] shrink-0 items-center justify-center rounded-full bg-niki-orange px-1.5 font-figures text-[11px] font-bold text-white">
                        {e.unread > 99 ? "99+" : e.unread}
                      </span>
                    ) : null}
                  </button>
                </li>
              ))}
            </ul>
          )}

          <ActionLink
            href="/admin/data/chatroom"
            onClick={() => setOpen(false)}
            className="niki-focus block border-t border-niki-edge bg-white px-4 py-2.5 text-center text-xs font-semibold text-niki-trust hover:bg-niki-surface"
          >
            Open the chatroom
          </ActionLink>
        </div>
      ) : null}

      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-label={waiting > 0 ? `Enquiries, ${waiting} unread` : "Enquiries"}
        className="niki-focus fixed bottom-4 right-4 z-[80] flex h-14 w-14 items-center justify-center rounded-full bg-niki-black text-white shadow-lg transition-transform hover:scale-[1.03] active:scale-95"
      >
        <Headphones className="h-6 w-6" />
        {waiting > 0 ? (
          <span className="absolute -right-0.5 -top-0.5 flex h-5 min-w-[20px] items-center justify-center rounded-full bg-niki-orange px-1 font-figures text-[11px] font-bold text-white ring-2 ring-white">
            {waiting > 9 ? "9+" : waiting}
          </span>
        ) : null}
      </button>
    </>
  );
}
