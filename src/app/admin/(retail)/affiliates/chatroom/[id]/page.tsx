import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { Container } from "@/components/ui/Container";
import { RoomView } from "@/components/chat/RoomView";
import { conversationAccess, getMembers, getMessages } from "@/lib/chat/conversations";
import { currentViewer } from "@/lib/chat/viewer";

export const metadata: Metadata = { title: "Conversation — Affiliates — Nickimart" };
export const dynamic = "force-dynamic";

export default async function AdminAffiliateRoomPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const viewer = await currentViewer();
  if (viewer?.who.kind !== "ADMIN") redirect("/admin");

  const { id } = await params;
  const access = await conversationAccess(id, viewer.who);
  if (!access.ok || !access.conversation) notFound();

  const [members, messages] = await Promise.all([getMembers(id), getMessages(id)]);

  return (
    <Container className="py-6 sm:py-8">
      <RoomView
        conversation={access.conversation}
        members={members}
        me={{ key: viewer.key, name: viewer.name }}
        backHref="/admin/affiliates/chatroom"
        canClose={access.isOwner || access.isAdmin}
        history={messages.map((m) => ({
          id: m.id,
          participant: m.participant,
          authorName: m.authorName,
          body: m.body,
          createdAt: m.createdAt.toISOString(),
        }))}
      />
    </Container>
  );
}
