import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { ChatroomShell } from "@/components/admin/ChatroomShell";
import { ConversationList } from "@/components/chat/ConversationList";
import { isChatConfigured } from "@/lib/chat/ably";
import { listSupportConversations } from "@/lib/chat/conversations";
import { currentViewer } from "@/lib/chat/viewer";

export const metadata: Metadata = { title: "Chatroom — Admin — Nickimart" };
export const dynamic = "force-dynamic";

/**
 * Enquiries: the only rooms with somebody outside the business at the other
 * end, so they lead the module.
 */
export default async function AdminChatroomPage() {
  const viewer = await currentViewer();
  if (viewer?.who.kind !== "ADMIN") redirect("/admin");

  const rows = await listSupportConversations(viewer.who);
  const unread = rows.reduce((sum, r) => sum + (r.status === "open" ? r.unread : 0), 0);

  return (
    <ChatroomShell unread={unread}>
      {!isChatConfigured() ? (
        <p className="mb-4 rounded-2xl bg-amber-50 px-5 py-4 text-sm text-amber-800 ring-1 ring-amber-200">
          Live chat isn&apos;t set up on this deployment, so the bubble on the site is hidden and
          rooms cannot be opened.
        </p>
      ) : null}

      <ConversationList
        rows={rows}
        basePath="/admin/data/chatroom"
        empty="Enquiries from the chat bubble on the site land here."
      />
    </ChatroomShell>
  );
}
