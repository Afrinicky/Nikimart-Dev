import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AffiliateChatroomShell } from "@/components/affiliate/ChatroomShell";
import { ConversationList } from "@/components/chat/ConversationList";
import { StartDirect } from "@/components/chat/StartDirect";
import { requireUser } from "@/lib/session";
import { getAffiliateForUser } from "@/lib/affiliate";
import { prisma } from "@/lib/prisma";
import { getDownlineIds } from "@/lib/affiliate-team";
import { getPendingRequests, listConversationsFor } from "@/lib/chat/conversations";
import { currentViewer } from "@/lib/chat/viewer";
import { participantKey } from "@/lib/chat/identity";

export const metadata: Metadata = { title: "Direct messages — Affiliate — Nickimart" };
export const dynamic = "force-dynamic";

/**
 * One-to-one, with the people this affiliate actually has dealings with: their
 * own team, and whoever recruited them. Not a directory of every affiliate on
 * the platform — that is a way to be messaged by strangers.
 */
export default async function AffiliateDirectPage() {
  const user = await requireUser();
  const affiliate = await getAffiliateForUser(user.id);
  if (!affiliate) redirect("/become-an-affiliate");
  const viewer = await currentViewer();
  if (!viewer) redirect("/affiliate");

  const { level1, level2 } = await getDownlineIds(affiliate.id);
  const reachable = [...level1, ...level2, ...(affiliate.referredById ? [affiliate.referredById] : [])];

  const [rows, requests, people] = await Promise.all([
    listConversationsFor(viewer.who, { kind: "DIRECT" }),
    getPendingRequests(viewer.who),
    reachable.length
      ? prisma.affiliate
          .findMany({
            where: { id: { in: reachable } },
            orderBy: { name: "asc" },
            select: { id: true, name: true, code: true },
          })
          .catch((): { id: string; name: string; code: string | null }[] => [])
      : Promise.resolve([] as { id: string; name: string; code: string | null }[]),
  ]);

  return (
    <AffiliateChatroomShell active="/affiliate/chatroom/direct" requests={requests.length}>
      <div className="space-y-4">
        {people.length > 0 ? (
          <StartDirect
            basePath="/affiliate/chatroom"
            people={people.map((p) => ({
              key: participantKey("AFFILIATE", p.id),
              name: p.name,
              hint: p.code ?? "",
            }))}
          />
        ) : null}
        <ConversationList
          rows={rows.map((r) => ({ ...r, title: r.title || "Direct message" }))}
          basePath="/affiliate/chatroom"
          empty="Message someone in your team and the thread stays here."
        />
      </div>
    </AffiliateChatroomShell>
  );
}
