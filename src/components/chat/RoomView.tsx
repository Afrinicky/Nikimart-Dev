import { ArrowLeft, Lock, Phone, Users } from "lucide-react";
import { ActionLink } from "@/components/ui/motion";
import { ChatRoom, type RoomMessage } from "@/components/chat/ChatRoom";
import { closeConversation } from "@/lib/chat/actions";
import { CONVERSATION_LABELS, type ConversationKind } from "@/lib/chat/identity";
import type { Conversation, MemberRow } from "@/lib/chat/conversations";
import { cn } from "@/lib/cn";

/**
 * One room, drawn the same way wherever it is opened.
 *
 * The header carries what you need to answer somebody — who is in it, and for
 * an enquiry the number to call when chat stops being the right tool.
 */
export function RoomView({
  conversation,
  members,
  history,
  me,
  backHref,
  canClose,
}: {
  conversation: Conversation;
  members: MemberRow[];
  history: RoomMessage[];
  me: { key: string; name: string };
  backHref: string;
  canClose: boolean;
}) {
  const closed = conversation.status === "closed";
  const title =
    conversation.title || CONVERSATION_LABELS[conversation.kind as ConversationKind] || "Room";

  return (
    <div className="space-y-4">
      <ActionLink
        href={backHref}
        className="inline-flex items-center gap-1.5 text-sm font-semibold text-niki-ink/60 hover:text-niki-orange"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to chatroom
      </ActionLink>

      <div className="overflow-hidden rounded-2xl bg-niki-surface ring-1 ring-niki-edge">
        <div className="flex flex-wrap items-center gap-3 border-b border-niki-edge bg-white px-4 py-3">
          <div className="min-w-0 flex-1">
            <p className="flex items-center gap-2 truncate font-display font-bold text-niki-ink">
              {title}
              {closed ? <Lock className="h-3.5 w-3.5 shrink-0 text-niki-ink/30" /> : null}
            </p>
            <p className="flex flex-wrap items-center gap-x-3 text-xs text-niki-ink/50">
              <span className="flex items-center gap-1">
                <Users className="h-3 w-3" />
                {members.length} {members.length === 1 ? "person" : "people"}
              </span>
              {conversation.visitorPhone ? (
                <a
                  href={`tel:${conversation.visitorPhone}`}
                  className="flex items-center gap-1 font-mono text-niki-trust hover:underline"
                >
                  <Phone className="h-3 w-3" />
                  {conversation.visitorPhone}
                </a>
              ) : null}
            </p>
          </div>

          {canClose && !closed ? (
            <form action={closeConversation}>
              <input type="hidden" name="id" value={conversation.id} />
              <button
                type="submit"
                className="niki-press niki-focus rounded-xl bg-white px-3.5 py-2 text-xs font-bold text-niki-ink/60 ring-1 ring-niki-edge hover:bg-niki-black/5"
              >
                Close
              </button>
            </form>
          ) : null}
        </div>

        <ChatRoom
          conversationId={conversation.id}
          me={me}
          history={history}
          readOnly={closed}
          className={cn("h-[30rem] bg-niki-surface")}
        />
      </div>

      {closed ? (
        <p className="rounded-2xl bg-white px-5 py-3.5 text-sm text-niki-ink/55 ring-1 ring-niki-edge">
          This conversation is closed. The record stays here.
        </p>
      ) : null}
    </div>
  );
}
