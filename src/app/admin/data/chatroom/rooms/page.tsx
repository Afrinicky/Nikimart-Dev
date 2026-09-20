import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { ChatroomShell } from "@/components/admin/ChatroomShell";
import { ConversationList } from "@/components/chat/ConversationList";
import { GroupRoomForm } from "@/components/admin/GroupRoomForm";
import { dataDb } from "@/lib/data-db";
import { listConversationsFor, listSupportConversations } from "@/lib/chat/conversations";
import { currentViewer } from "@/lib/chat/viewer";

export const metadata: Metadata = { title: "Chatroom rooms — Admin — Nickimart" };
export const dynamic = "force-dynamic";

/** Rooms an admin made — a group of people who need the same answer. */
export default async function AdminChatroomRoomsPage() {
  const viewer = await currentViewer();
  if (viewer?.who.kind !== "ADMIN") redirect("/admin");

  const [rows, support, agents] = await Promise.all([
    listConversationsFor(viewer.who, { kind: "GROUP" }),
    listSupportConversations(viewer.who),
    dataDb.dataAgent
      .findMany({
        where: { status: "active" },
        orderBy: { storeName: "asc" },
        take: 300,
        select: { id: true, code: true, storeName: true },
      })
      .catch((): { id: string; code: string; storeName: string }[] => []),
  ]);
  const unread = support.reduce((sum, r) => sum + (r.status === "open" ? r.unread : 0), 0);

  return (
    <ChatroomShell unread={unread}>
      <div className="space-y-4">
        <GroupRoomForm agents={agents} />
        <ConversationList
          rows={rows}
          basePath="/admin/data/chatroom"
          empty="Make a room for a group who need the same answer — all data agents, say."
        />
      </div>
    </ChatroomShell>
  );
}
