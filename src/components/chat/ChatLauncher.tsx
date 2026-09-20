"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { MessageCircle, X } from "lucide-react";
import { FloatingBubble } from "@/components/chat/FloatingBubble";
import { ChatRoom, type RoomMessage } from "@/components/chat/ChatRoom";
import { startEnquiry } from "@/lib/chat/actions";
import { enquiryClaim } from "@/components/chat/enquiry-store";

/**
 * The chat bubble on the public pages.
 *
 * Sized and placed the way the convention runs, because a launcher people have
 * to look for is a launcher nobody presses: 56px, bottom right, the brand
 * accent, and a pulse that plays a few times on arrival and then stops. It
 * says what it is for rather than "Chat" — a label naming a real task is the
 * difference between a button and a decoration.
 *
 * A name and a number come first. An answer nobody can deliver is not an
 * answer: a visitor who closes the tab is unreachable otherwise, and most of
 * what people ask a bundle shop is about an order somebody has to look up.
 */
export function ChatLauncher({ label = "Need help?" }: { label?: string }) {
  const [open, setOpen] = useState(false);
  // Read through a store rather than in an effect: reading storage during
  // render is a hydration mismatch, and setting state from a mount effect is a
  // second render nobody asked for.
  const claim = useSyncExternalStore(
    enquiryClaim.subscribe,
    enquiryClaim.get,
    enquiryClaim.server,
  );
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  async function begin(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const result = await startEnquiry({ name, phone });
    setBusy(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    enquiryClaim.save({
      conversationId: result.conversationId,
      visitorToken: result.visitorToken,
      name: result.name,
    });
  }

  return (
    <FloatingBubble
      storageKey="niki-chat-bubble"
      hasBottomNav
      label={label}
      open={open}
      onOpenChange={setOpen}
      icon={<MessageCircle className="h-6 w-6" />}
      panel={
        <>
          <div className="flex items-center justify-between gap-3 bg-niki-black px-4 py-3.5 text-white">
            <div className="min-w-0">
              <p className="truncate font-display text-sm font-bold">Nickimart</p>
              <p className="flex items-center gap-1.5 text-[11px] text-white/55">
                <span className="h-1.5 w-1.5 rounded-full bg-niki-success" />
                We usually reply within minutes
              </p>
            </div>
            <button
              type="button"
              onClick={() => setOpen(false)}
              aria-label="Close chat"
              className="niki-press niki-focus rounded-lg p-1.5 text-white/60 transition-colors hover:bg-white/10 hover:text-white"
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          {claim ? (
            <>
              <ChatRoom
                conversationId={claim.conversationId}
                visitorToken={claim.visitorToken}
                me={{ key: `VISITOR:${claim.visitorToken}`, name: claim.name }}
                history={[] as RoomMessage[]}
                placeholder="Type your question…"
                className="min-h-0 flex-1"
              />
              <button
                type="button"
                onClick={() => {
                  enquiryClaim.clear();
                  setName("");
                  setPhone("");
                }}
                className="niki-focus border-t border-niki-edge bg-white px-4 py-2 text-[11px] font-semibold text-niki-ink/45 hover:text-niki-ink"
              >
                Start a new enquiry
              </button>
            </>
          ) : (
            <form
              onSubmit={begin}
              className="flex min-h-0 flex-1 flex-col justify-center gap-3 overflow-y-auto px-5 py-4"
            >
              <p className="text-sm text-niki-ink/70">
                Leave your name and number and we&apos;ll pick this up right away.
              </p>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
                maxLength={60}
                placeholder="Your name"
                aria-label="Your name"
                className="w-full rounded-xl border border-niki-edge-strong bg-white px-4 py-2.5 text-sm outline-none focus:border-niki-orange focus:ring-2 focus:ring-niki-orange/20"
              />
              <input
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                required
                inputMode="tel"
                placeholder="024 000 0000"
                aria-label="Your phone number"
                className="w-full rounded-xl border border-niki-edge-strong bg-white px-4 py-2.5 text-sm outline-none focus:border-niki-orange focus:ring-2 focus:ring-niki-orange/20"
              />
              {error ? <p className="text-xs font-medium text-niki-danger">{error}</p> : null}
              <button
                type="submit"
                disabled={busy}
                className="niki-press niki-focus w-full rounded-xl bg-niki-orange px-5 py-3 text-sm font-bold text-white disabled:opacity-60"
              >
                {busy ? "Starting…" : "Start chatting"}
              </button>
            </form>
          )}
        </>
      }
    />
  );
}
