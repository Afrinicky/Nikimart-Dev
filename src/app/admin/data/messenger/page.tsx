import type { Metadata } from "next";
import { Container } from "@/components/ui/Container";
import { MessengerHeader } from "@/components/admin/messenger/MessengerHeader";
import { MessengerStats } from "@/components/admin/messenger/MessengerStats";
import { ChatView } from "@/components/admin/messenger/ChatView";
import { ANNOUNCEMENT_MODULE_TABS } from "@/lib/announcement-module";
import { unreadNotificationCount } from "@/lib/data-bundles/notifications";
import { loadChats } from "@/lib/messenger-page";
import { requireDataAdminAction } from "@/lib/data-bundles/session";

export const metadata: Metadata = { title: "Messenger — Admin — Nickimart" };
export const dynamic = "force-dynamic";

/**
 * Writing to one person, from the bundle console.
 *
 * The Messages tab used to be a list of the platform's own automatic wording
 * and nothing else — which meant the console could tell an agent their payout
 * had been sent, and could not tell them anything a human had thought of.
 * This is the other half: a contact, a thread, a box to type in.
 */
export default async function DataMessengerPage({
  searchParams,
}: {
  searchParams: Promise<{ c?: string }>;
}) {
  await requireDataAdminAction();
  const { c } = await searchParams;
  const [data, unread] = await Promise.all([loadChats("data", c), unreadNotificationCount()]);

  return (
    <Container className="py-8">
      <MessengerHeader scope="data" tabs={ANNOUNCEMENT_MODULE_TABS("data", unread)} />
      <div className="mt-6 space-y-4">
        <MessengerStats stats={data.stats} />
        <ChatView
          scope="data"
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
