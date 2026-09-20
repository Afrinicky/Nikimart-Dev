import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { RoomView } from "@/components/chat/RoomView";
import { requireUser } from "@/lib/session";
import { getAgentForUser } from "@/lib/data-bundles/agents";
import { conversationAccess, getMembers, getMessages } from "@/lib/chat/conversations";
import { currentViewer } from "@/lib/chat/viewer";

export const metadata: Metadata = { title: "Conversation — Agent — Nickimart" };
export const dynamic = "force-dynamic";

export default async function AgentRoomPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  if (!(await getAgentForUser(user.id))) redirect("/become-an-agent");
  const viewer = await currentViewer();
  if (!viewer) redirect("/agent");

  const { id } = await params;
  const access = await conversationAccess(id, viewer.who);
  if (!access.ok || !access.conversation) notFound();

  const [members, messages] = await Promise.all([getMembers(id), getMessages(id)]);

  return (
    <RoomView
      conversation={access.conversation}
      members={members}
      me={{ key: viewer.key, name: viewer.name }}
      backHref="/agent/chatroom"
      canClose={access.isOwner}
      history={messages.map((m) => ({
        id: m.id,
        participant: m.participant,
        authorName: m.authorName,
        body: m.body,
        createdAt: m.createdAt.toISOString(),
      }))}
    />
  );
}
