import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Container } from "@/components/ui/Container";
import { PanelHeading } from "@/components/admin/ModuleHeader";
import { ModuleTabs } from "@/components/admin/ModuleTabs";
import { AffiliateModuleHeader } from "@/components/admin/AffiliateModuleHeader";
import { ConversationList } from "@/components/chat/ConversationList";
import { GroupRoomForm } from "@/components/admin/GroupRoomForm";
import { prisma } from "@/lib/prisma";
import { listConversationsFor } from "@/lib/chat/conversations";
import { currentViewer } from "@/lib/chat/viewer";
import { AFFILIATE_CHATROOM_TABS } from "@/lib/chat/module";

export const metadata: Metadata = { title: "Chatroom — Affiliates — Nickimart" };
export const dynamic = "force-dynamic";

/**
 * Rooms for affiliates.
 *
 * The same rooms the bundle agents have, for the other programme: one place to
 * tell a group the same thing, instead of the same message pasted into forty
 * WhatsApp threads. A room holds one community — mixing agents and affiliates
 * would be a room where neither knows who the others are.
 */
export default async function AdminAffiliateChatroomPage() {
  const viewer = await currentViewer();
  if (viewer?.who.kind !== "ADMIN") redirect("/admin");

  const [rows, affiliates] = await Promise.all([
    listConversationsFor(viewer.who, { kind: "GROUP" }),
    prisma.affiliate
      .findMany({
        where: { status: "active" },
        orderBy: { name: "asc" },
        take: 300,
        select: { id: true, name: true, code: true },
      })
      .catch((): { id: string; name: string; code: string | null }[] => []),
  ]);

  return (
    <Container className="py-6 sm:py-8">
      <AffiliateModuleHeader />

      <div className="mt-6">
        <ModuleTabs tabs={AFFILIATE_CHATROOM_TABS()} />
        <div className="mt-5">
          <PanelHeading
            title="Rooms"
            subtitle="Tell a group of affiliates the same thing, in one place they can answer in."
          />
          <div className="space-y-4">
            <GroupRoomForm
              community="affiliates"
              noun="affiliate"
              people={affiliates.map((a) => ({
                id: a.id,
                name: a.name,
                hint: a.code ?? "",
              }))}
            />
            <ConversationList
              rows={rows}
              basePath="/admin/affiliates/chatroom"
              empty="Make a room for a group who need the same answer — every active affiliate, say."
            />
          </div>
        </div>
      </div>
    </Container>
  );
}
