import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AgentChatroomShell } from "@/components/agent/AgentChatroomShell";
import { ConversationList } from "@/components/chat/ConversationList";
import { requireUser } from "@/lib/session";
import { getAgentForUser } from "@/lib/data-bundles/agents";
import { getPendingRequests, listConversationsFor } from "@/lib/chat/conversations";
import { currentViewer } from "@/lib/chat/viewer";

export const metadata: Metadata = { title: "Chatroom — Agent — Nickimart" };
export const dynamic = "force-dynamic";

/** Every room this agent is in — their team's, groups, sessions. */
export default async function AgentChatroomPage() {
  const user = await requireUser();
  if (!(await getAgentForUser(user.id))) redirect("/become-an-agent");
  const viewer = await currentViewer();
  if (!viewer) redirect("/agent");

  const [rows, requests] = await Promise.all([
    listConversationsFor(viewer.who),
    getPendingRequests(viewer.who),
  ]);

  return (
    <AgentChatroomShell active="/agent/chatroom" requests={requests.length}>
      <ConversationList
        rows={rows.filter((r) => r.kind !== "DIRECT")}
        basePath="/agent/chatroom"
        empty="Rooms you are put in, and sessions you join, appear here."
      />
    </AgentChatroomShell>
  );
}
