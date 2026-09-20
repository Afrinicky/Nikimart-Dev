import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AgentChatroomShell } from "@/components/agent/AgentChatroomShell";
import { ConversationList } from "@/components/chat/ConversationList";
import { StartDirect } from "@/components/chat/StartDirect";
import { requireUser } from "@/lib/session";
import { getAgentForUser } from "@/lib/data-bundles/agents";
import { getTeamScope } from "@/lib/data-bundles/team/hierarchy";
import { dataDb } from "@/lib/data-db";
import { getPendingRequests, listConversationsFor } from "@/lib/chat/conversations";
import { currentViewer } from "@/lib/chat/viewer";
import { participantKey } from "@/lib/chat/identity";

export const metadata: Metadata = { title: "Direct messages — Agent — Nickimart" };
export const dynamic = "force-dynamic";

/**
 * One-to-one, with the people an agent actually has dealings with: their own
 * team, and whoever recruited them. Not a directory of every agent on the
 * platform — that is a way to be messaged by strangers.
 */
export default async function AgentDirectPage() {
  const user = await requireUser();
  const agent = await getAgentForUser(user.id);
  if (!agent) redirect("/become-an-agent");
  const viewer = await currentViewer();
  if (!viewer) redirect("/agent");

  const scope = await getTeamScope(agent.id);
  const reachable = [...scope.allIds, ...(agent.referredById ? [agent.referredById] : [])];

  const [rows, requests, people] = await Promise.all([
    listConversationsFor(viewer.who, { kind: "DIRECT" }),
    getPendingRequests(viewer.who),
    reachable.length
      ? dataDb.dataAgent
          .findMany({
            where: { id: { in: reachable } },
            orderBy: { storeName: "asc" },
            select: { id: true, code: true, storeName: true },
          })
          .catch((): { id: string; code: string; storeName: string }[] => [])
      : Promise.resolve([] as { id: string; code: string; storeName: string }[]),
  ]);

  return (
    <AgentChatroomShell active="/agent/chatroom/direct" requests={requests.length}>
      <div className="space-y-4">
        {people.length > 0 ? (
          <StartDirect
            basePath="/agent/chatroom"
            people={people.map((p) => ({
              key: participantKey("AGENT", p.id),
              name: p.storeName,
              hint: p.code,
            }))}
          />
        ) : null}
        <ConversationList
          rows={rows.map((r) => ({ ...r, title: r.title || "Direct message" }))}
          basePath="/agent/chatroom"
          empty="Message someone in your team and the thread stays here."
        />
      </div>
    </AgentChatroomShell>
  );
}
