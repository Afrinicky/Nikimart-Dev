import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Container } from "@/components/ui/Container";
import { PanelHeading } from "@/components/admin/ModuleHeader";
import { ModuleTabs } from "@/components/admin/ModuleTabs";
import { AffiliateModuleHeader } from "@/components/admin/AffiliateModuleHeader";
import { ConversationList } from "@/components/chat/ConversationList";
import { StartDirect } from "@/components/chat/StartDirect";
import { prisma } from "@/lib/prisma";
import { listConversationsFor } from "@/lib/chat/conversations";
import { currentViewer } from "@/lib/chat/viewer";
import { participantKey } from "@/lib/chat/identity";
import { AFFILIATE_CHATROOM_TABS } from "@/lib/chat/module";

export const metadata: Metadata = { title: "Direct messages — Affiliates — Nickimart" };
export const dynamic = "force-dynamic";

/** One-to-one with one affiliate, when a room is the wrong place for it. */
export default async function AdminAffiliateDirectPage() {
  const viewer = await currentViewer();
  if (viewer?.who.kind !== "ADMIN") redirect("/admin");

  const [rows, affiliates] = await Promise.all([
    listConversationsFor(viewer.who, { kind: "DIRECT" }),
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
          <PanelHeading title="Direct" subtitle="A thread with one affiliate, and nobody else." />
          <div className="space-y-4">
            <StartDirect
              basePath="/admin/affiliates/chatroom"
              people={affiliates.map((a) => ({
                key: participantKey("AFFILIATE", a.id),
                name: a.name,
                hint: a.code ?? "",
              }))}
            />
            <ConversationList
              rows={rows.map((r) => ({ ...r, title: r.title || "Direct message" }))}
              basePath="/admin/affiliates/chatroom"
              empty="Nothing yet."
            />
          </div>
        </div>
      </div>
    </Container>
  );
}
