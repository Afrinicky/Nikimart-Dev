"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import * as Ably from "ably";
import { Loader2, Send, WifiOff } from "lucide-react";
import { inputClass } from "@/components/ui/Field";
import { CHAT_EVENT, sessionChannel } from "@/lib/chat/channels";
import { cn } from "@/lib/cn";

/**
 * Nickimart live chat.
 *
 * The browser talks to the realtime service directly: no serverless function
 * is held open for the length of a conversation, and nothing is written to the
 * database as people type. The only server call is the one that mints a token,
 * and it happens once on joining — which is also where membership is checked,
 * so a room cannot be entered by naming it.
 *
 * The transcript is kept here, in order, and handed back when the host closes
 * the room. That is the whole arrangement: the service carries the
 * conversation, and the database only ever sees the record of it, once.
 *
 * Written against a room rather than against teams, so the next thing that
 * needs a live conversation needs a channel name and nothing else.
 */

export interface ChatLine {
  id: string;
  agentId: string | null;
  authorName: string;
  body: string;
  saidAt: string;
}

type Status = "connecting" | "live" | "offline" | "error";

export function LiveChat({
  sessionId,
  me,
  readOnly = false,
  onTranscript,
  history = [],
}: {
  sessionId: string;
  me: { agentId: string; name: string };
  /** True once the room is closed: the transcript is readable, not writable. */
  readOnly?: boolean;
  /** Handed the transcript whenever it changes, for the host to save. */
  onTranscript?: (lines: ChatLine[]) => void;
  /** Anything already on the record, for a room being reviewed. */
  history?: ChatLine[];
}) {
  const [lines, setLines] = useState<ChatLine[]>(history);
  const [status, setStatus] = useState<Status>(readOnly ? "offline" : "connecting");
  const [draft, setDraft] = useState("");
  const [error, setError] = useState<string | null>(null);
  const channelRef = useRef<Ably.RealtimeChannel | null>(null);
  const bottom = useRef<HTMLDivElement>(null);

  // The host's save button needs whatever has been said so far. Kept out of
  // the connection effect below, which would otherwise tear the connection
  // down and rebuild it on every single message.
  useEffect(() => {
    onTranscript?.(lines);
  }, [lines, onTranscript]);

  useEffect(() => {
    if (readOnly) return;
    let cancelled = false;

    // authUrl rather than a key: the token is minted per join, scoped to this
    // one room, and the API key never reaches the browser at all.
    const client = new Ably.Realtime({
      authUrl: "/api/chat/token",
      authMethod: "POST",
      authHeaders: { "Content-Type": "application/json" },
      authParams: { sessionId },
      clientId: me.agentId,
      // A phone backgrounding the tab is not a reason to leave the room.
      closeOnUnload: false,
    });

    const channel = client.channels.get(sessionChannel(sessionId));
    channelRef.current = channel;

    const onMessage = (msg: Ably.Message) => {
      if (cancelled) return;
      const data = (msg.data ?? {}) as Partial<ChatLine>;
      const body = typeof data.body === "string" ? data.body : "";
      if (!body) return;
      const id = msg.id ?? `${msg.timestamp ?? Date.now()}`;
      setLines((current) =>
        // Redelivery on reconnect is normal, so an id that is already here is
        // the same line rather than a second one.
        current.some((l) => l.id === id)
          ? current
          : [
              ...current,
              {
                id,
                agentId: msg.clientId ?? null,
                authorName: data.authorName ?? "Someone",
                body,
                saidAt: new Date(msg.timestamp ?? Date.now()).toISOString(),
              },
            ],
      );
    };

    channel.subscribe(CHAT_EVENT, onMessage);
    client.connection.on("connected", () => !cancelled && setStatus("live"));
    client.connection.on("disconnected", () => !cancelled && setStatus("offline"));
    client.connection.on("failed", () => {
      if (cancelled) return;
      setStatus("error");
      setError("Couldn't connect to the room.");
    });

    return () => {
      cancelled = true;
      channel.unsubscribe(CHAT_EVENT, onMessage);
      client.close();
      channelRef.current = null;
    };
  }, [sessionId, me.agentId, readOnly]);

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
        await channelRef.current.publish(CHAT_EVENT, { body, authorName: me.name });
      } catch {
        setError("That didn't send. Check your connection.");
        setDraft(body);
      }
    },
    [draft, me.name],
  );

  return (
    <div className="flex h-[26rem] flex-col overflow-hidden rounded-2xl bg-white ring-1 ring-niki-edge">
      <div className="flex items-center justify-between gap-3 border-b border-niki-edge px-4 py-2.5">
        <p className="text-sm font-semibold text-niki-ink">
          {readOnly ? "Transcript" : "Live chat"}
        </p>
        {readOnly ? null : (
          <span
            className={cn(
              "flex items-center gap-1.5 text-[11px] font-semibold",
              status === "live" ? "text-niki-success" : "text-niki-ink/45",
            )}
          >
            {status === "connecting" ? (
              <Loader2 className="h-3 w-3 animate-spin" />
            ) : status === "live" ? (
              <span className="h-1.5 w-1.5 rounded-full bg-niki-success" />
            ) : (
              <WifiOff className="h-3 w-3" />
            )}
            {status === "live" ? "Connected" : status === "connecting" ? "Connecting…" : "Offline"}
          </span>
        )}
      </div>

      <div className="min-h-0 flex-1 space-y-2.5 overflow-y-auto px-4 py-3">
        {lines.length === 0 ? (
          <p className="py-10 text-center text-sm text-niki-ink/50">
            {readOnly ? "Nothing was said." : "Say something to get started."}
          </p>
        ) : (
          lines.map((l) => {
            const mine = l.agentId === me.agentId;
            return (
              <div key={l.id} className={cn("flex", mine ? "justify-end" : "justify-start")}>
                <div
                  className={cn(
                    "max-w-[80%] rounded-2xl px-3.5 py-2",
                    mine ? "bg-niki-orange text-white" : "bg-niki-surface text-niki-ink",
                  )}
                >
                  {mine ? null : (
                    <p className="text-[11px] font-bold text-niki-ink/50">{l.authorName}</p>
                  )}
                  <p className="whitespace-pre-wrap break-words text-sm">{l.body}</p>
                  <p
                    className={cn("mt-0.5 text-[10px]", mine ? "text-white/60" : "text-niki-ink/40")}
                  >
                    {new Date(l.saidAt).toLocaleTimeString("en-GB", {
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
        <form onSubmit={send} className="flex gap-2 border-t border-niki-edge p-3">
          <input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            maxLength={2000}
            placeholder="Message your team…"
            aria-label="Message"
            className={cn(inputClass, "flex-1")}
          />
          <button
            type="submit"
            disabled={!draft.trim() || status !== "live"}
            aria-label="Send"
            className="niki-press niki-focus flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-niki-orange text-white disabled:opacity-40"
          >
            <Send className="h-4 w-4" />
          </button>
        </form>
      )}
    </div>
  );
}
