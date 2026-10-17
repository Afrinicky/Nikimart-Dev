import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AffiliateChatroomShell } from "@/components/affiliate/ChatroomShell";
import { ConversationList } from "@/components/chat/ConversationList";
import { requireUser } from "@/lib/session";
import { getAffiliateForUser } from "@/lib/affiliate";
import { getPendingRequests, listConversationsFor } from "@/lib/chat/conversations";
import { currentViewer } from "@/lib/chat/viewer";

export const metadata: Metadata = { title: "Chatroom — Affiliate — Nickimart" };
export const dynamic = "force-dynamic";

/** Every room this affiliate is in — their team's, and groups Nickimart made. */
export default async function AffiliateChatroomPage() {
  const user = await requireUser();
  if (!(await getAffiliateForUser(user.id))) redirect("/become-an-affiliate");
  const viewer = await currentViewer();
  if (!viewer) redirect("/affiliate");

  const [rows, requests] = await Promise.all([
    listConversationsFor(viewer.who),
    getPendingRequests(viewer.who),
  ]);

  return (
    <AffiliateChatroomShell active="/affiliate/chatroom" requests={requests.length}>
      <ConversationList
        rows={rows.filter((r) => r.kind !== "DIRECT")}
        basePath="/affiliate/chatroom"
        empty="Rooms you are put in, and your own team's room, appear here."
      />
    </AffiliateChatroomShell>
  );
}
