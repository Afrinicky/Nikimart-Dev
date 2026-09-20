import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { ChatroomShell } from "@/components/admin/ChatroomShell";
import { ConversationList } from "@/components/chat/ConversationList";
import { StartDirect } from "@/components/chat/StartDirect";
import { dataDb } from "@/lib/data-db";
import { listConversationsFor, listSupportConversations } from "@/lib/chat/conversations";
import { currentViewer } from "@/lib/chat/viewer";
import { participantKey } from "@/lib/chat/identity";

export const metadata: Metadata = { title: "Direct messages — Admin — Nickimart" };
export const dynamic = "force-dynamic";

/** One-to-one with an agent. */
export default async function AdminDirectPage() {
  const viewer = await currentViewer();
  if (viewer?.who.kind !== "ADMIN") redirect("/admin");

  const [rows, support, agents] = await Promise.all([
    listConversationsFor(viewer.who, { kind: "DIRECT" }),
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
        <StartDirect
          basePath="/admin/data/chatroom"
          people={agents.map((a) => ({
            key: participantKey("AGENT", a.id),
            name: a.storeName,
            hint: a.code,
          }))}
        />
        <ConversationList
          rows={rows.map((r) => ({ ...r, title: r.title || "Direct message" }))}
          basePath="/admin/data/chatroom"
          empty="Message an agent directly and the thread stays here."
        />
      </div>
    </ChatroomShell>
  );
}
