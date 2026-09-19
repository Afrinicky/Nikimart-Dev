"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { DoorClosed } from "lucide-react";
import { SubmitButton } from "@/components/ui/motion";
import { FormFeedback } from "@/components/ui/FormFeedback";
import { LiveChat, type ChatLine } from "@/components/chat/LiveChat";
import {
  endSession,
  markAttendance,
  type SessionState,
} from "@/lib/data-bundles/team/session-actions";

/**
 * The room itself: the chat, and the host's way out of it.
 *
 * Attendance is recorded once, on arrival, rather than on a timer — a leader
 * wants to know who came, not how long each tab stayed open.
 *
 * Closing the room hands the transcript back in one request. The realtime
 * service carried the conversation; this is the single write that keeps it.
 */
export function SessionRoom({
  sessionId,
  me,
  isHost,
  history,
}: {
  sessionId: string;
  me: { agentId: string; name: string };
  isHost: boolean;
  history: ChatLine[];
}) {
  const [state, formAction] = useActionState<SessionState, FormData>(endSession, {});
  const [transcript, setTranscript] = useState<ChatLine[]>(history);
  const counted = useRef(false);

  useEffect(() => {
    if (counted.current) return;
    counted.current = true;
    void markAttendance(sessionId);
  }, [sessionId]);

  return (
    <div className="space-y-3">
      <LiveChat
        sessionId={sessionId}
        me={me}
        history={history}
        onTranscript={setTranscript}
      />

      {isHost ? (
        <form action={formAction} className="flex flex-wrap items-center gap-3">
          <input type="hidden" name="id" value={sessionId} />
          {/* The transcript travels with the close, so the room is closed and
              kept in one action rather than two that can half-happen. */}
          <input
            type="hidden"
            name="transcript"
            value={JSON.stringify(
              transcript.map((l) => ({
                agentId: l.agentId,
                authorName: l.authorName,
                body: l.body,
                saidAt: l.saidAt,
              })),
            )}
          />
          <SubmitButton
            pendingLabel="Closing…"
            icon={<DoorClosed className="h-4 w-4" />}
            className="rounded-xl bg-niki-black px-5 py-2.5 text-sm font-bold text-white"
          >
            End session and save
          </SubmitButton>
          <span className="text-xs text-niki-ink/50">
            {transcript.length} {transcript.length === 1 ? "message" : "messages"} will be kept.
          </span>
          <FormFeedback error={state.error} success={state.ok ? state.message : undefined} />
        </form>
      ) : null}
    </div>
  );
}
