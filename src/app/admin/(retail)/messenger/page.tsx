import type { Metadata } from "next";
import { Container } from "@/components/ui/Container";
import { MessengerHeader } from "@/components/admin/messenger/MessengerHeader";
import { MessengerStats } from "@/components/admin/messenger/MessengerStats";
import { ChatView } from "@/components/admin/messenger/ChatView";
import { ANNOUNCEMENT_MODULE_TABS } from "@/lib/announcement-module";
import { countOpenComplaints } from "@/lib/retail/complaints";
import { loadChats } from "@/lib/messenger-page";
import { requireAdmin } from "@/lib/session";

export const metadata: Metadata = { title: "Messenger — Admin — Nickimart" };
export const dynamic = "force-dynamic";

/**
 * Writing to one person, from the mall console.
 *
 * The same Messenger as the bundle side, down to the component — a console
 * where the same job looks different depending which half of the business you
 * are in is a console you have to learn twice. What differs is only whose
 * contacts it can see, which is the one thing that must never be shared.
 */
export default async function RetailMessengerPage({
  searchParams,
}: {
  searchParams: Promise<{ c?: string }>;
}) {
  await requireAdmin();
  const { c } = await searchParams;
  const [data, open] = await Promise.all([loadChats("retail", c), countOpenComplaints()]);

  return (
    <Container className="py-8">
      <MessengerHeader scope="retail" tabs={ANNOUNCEMENT_MODULE_TABS("retail", 0, open)} />
      <div className="mt-6 space-y-4">
        <MessengerStats stats={data.stats} />
        <ChatView
          scope="retail"
          threads={data.threads}
          contacts={data.contacts}
          groups={data.groups}
          audiences={data.audiences}
          active={data.active}
          messages={data.messages}
        />
      </div>
    </Container>
  );
}
