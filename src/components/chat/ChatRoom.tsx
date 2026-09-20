"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import * as Ably from "ably";
import { Loader2, Send, WifiOff } from "lucide-react";
import { CHAT_EVENT, conversationChannel } from "@/lib/chat/channels";
import { markConversationRead, saveMessage } from "@/lib/chat/actions";
import { cn } from "@/lib/cn";

/**
 * A room, wherever it is being shown: the chatroom module, a team session, the
 * popup on a public page.
 *
 * The browser talks to the realtime service directly, so nothing is held open
 * on this platform for the length of a conversation. A message is published
 * first and kept second — delivery should not wait on a database, and a write
 * that fails must not lose a message somebody has already read.
 */

export interface RoomMessage {
  id: string;
  participant: string;
  authorName: string;
  body: string;
  createdAt: string;
}

type Status = "connecting" | "live" | "offline";

export function ChatRoom({
  conversationId,
  me,
  history,
  visitorToken,
  readOnly = false,
  placeholder = "Write a message…",
  className,
}: {
  conversationId: string;
  me: { key: string; name: string };
  history: RoomMessage[];
  /** A visitor's claim on the room, for somebody not signed in. */
  visitorToken?: string;
  readOnly?: boolean;
  placeholder?: string;
  className?: string;
}) {
  const [lines, setLines] = useState<RoomMessage[]>(history);
  const [status, setStatus] = useState<Status>(readOnly ? "offline" : "connecting");
  const [draft, setDraft] = useState("");
  const [error, setError] = useState<string | null>(null);
  const channelRef = useRef<Ably.RealtimeChannel | null>(null);
  const bottom = useRef<HTMLDivElement>(null);

  const authParams = useMemo(
    () => ({ conversationId, ...(visitorToken ? { visitorToken } : {}) }),
    [conversationId, visitorToken],
  );

  useEffect(() => {
    if (readOnly) return;
    let cancelled = false;

    // authUrl rather than a key: the token is minted per join, scoped to this
    // one room, and the API key never reaches the browser.
    const client = new Ably.Realtime({
      authUrl: "/api/chat/token",
      // GET, so the params land on the URL where the route can always read
      // them — the SDK does not send JSON whatever it is told to declare.
      authMethod: "GET",
      authParams,
      clientId: me.key,
      closeOnUnload: false,
    });

    const channel = client.channels.get(conversationChannel(conversationId));
    channelRef.current = channel;

    const onMessage = (msg: Ably.Message) => {
      if (cancelled) return;
      const data = (msg.data ?? {}) as Partial<RoomMessage>;
      const body = typeof data.body === "string" ? data.body : "";
      if (!body) return;
      const id = msg.id ?? `${msg.timestamp ?? Date.now()}`;
      setLines((current) =>
        // Redelivery on reconnect is normal, so a known id is the same line.
        current.some((l) => l.id === id)
          ? current
          : [
              ...current,
              {
                id,
                participant: msg.clientId ?? "",
                authorName: data.authorName ?? "Someone",
                body,
                createdAt: new Date(msg.timestamp ?? Date.now()).toISOString(),
              },
            ],
      );
    };

    channel.subscribe(CHAT_EVENT, onMessage);
    client.connection.on("connected", () => !cancelled && setStatus("live"));
    client.connection.on("disconnected", () => !cancelled && setStatus("offline"));
    client.connection.on("failed", () => {
      if (cancelled) return;
      setStatus("offline");
      setError("Couldn't connect to this room.");
    });

    return () => {
      cancelled = true;
      channel.unsubscribe(CHAT_EVENT, onMessage);
      client.close();
      channelRef.current = null;
    };
  }, [conversationId, me.key, readOnly, authParams]);

  // Arriving is reading. Marked once, not on every message, because the count
  // it clears is about whether you have looked rather than how long you stayed.
  useEffect(() => {
    if (readOnly || visitorToken) return;
    void markConversationRead(conversationId);
  }, [conversationId, readOnly, visitorToken]);

  useEffect(() => {
    bottom.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [lines.length]);

  const send = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      const body = draft.trim();
      if (!body || !channelRef.current) return;
      setDraft("");
      setError(null);
      try {
        // Published first: delivery should not wait on a database, and a write
        // that fails must not lose a message somebody has already read.
        await channelRef.current.publish(CHAT_EVENT, { body, authorName: me.name });
        void saveMessage({ conversationId, body, visitorToken });
      } catch {
        setError("That didn't send. Check your connection.");
        setDraft(body);
      }
    },
    [draft, me.name, conversationId, visitorToken],
  );

  return (
    <div className={cn("flex min-h-0 flex-col", className)}>
      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-4 py-4">
        {lines.length === 0 ? (
          <p className="py-12 text-center text-sm text-niki-ink/45">
            {readOnly ? "Nothing was said." : "No messages yet."}
          </p>
        ) : (
          lines.map((l, i) => {
            const mine = l.participant === me.key;
            // A run of messages from one person reads as one turn: the name is
            // printed once at the top of it rather than on every bubble.
            const runStart = i === 0 || lines[i - 1].participant !== l.participant;
            return (
              <div
                key={l.id}
                className={cn("flex flex-col", mine ? "items-end" : "items-start")}
              >
                {!mine && runStart ? (
                  <span className="mb-1 px-1 text-[11px] font-bold text-niki-ink/45">
                    {l.authorName}
                  </span>
                ) : null}
                <div
                  className={cn(
                    "max-w-[82%] px-3.5 py-2 text-sm shadow-sm",
                    mine
                      ? "rounded-2xl rounded-br-md bg-niki-orange text-white"
                      : "rounded-2xl rounded-bl-md bg-white text-niki-ink ring-1 ring-niki-edge",
                  )}
                >
                  <p className="whitespace-pre-wrap break-words">{l.body}</p>
                  <p className={cn("mt-0.5 text-[10px]", mine ? "text-white/60" : "text-niki-ink/35")}>
                    {new Date(l.createdAt).toLocaleTimeString("en-GB", {
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </p>
                </div>
              </div>
            );
          })
        )}
        <div ref={bottom} />
      </div>

      {error ? (
        <p className="border-t border-niki-edge bg-niki-danger/5 px-4 py-2 text-xs font-medium text-niki-danger">
          {error}
        </p>
      ) : null}

      {readOnly ? null : (
        <form onSubmit={send} className="flex items-center gap-2 border-t border-niki-edge bg-white p-3">
          <input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            maxLength={2000}
            placeholder={placeholder}
            aria-label="Message"
            className="min-w-0 flex-1 rounded-full border border-niki-edge-strong bg-niki-surface px-4 py-2.5 text-sm text-niki-ink outline-none transition-colors placeholder:text-niki-ink/40 focus:border-niki-orange focus:bg-white focus:ring-2 focus:ring-niki-orange/20"
          />
          <button
            type="submit"
            disabled={!draft.trim() || status !== "live"}
            aria-label="Send"
            className="niki-press niki-focus flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-niki-orange text-white transition-opacity disabled:opacity-40"
          >
            {status === "connecting" ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : status === "offline" ? (
              <WifiOff className="h-4 w-4" />
            ) : (
              <Send className="h-4 w-4" />
            )}
          </button>
        </form>
      )}
    </div>
  );
}
