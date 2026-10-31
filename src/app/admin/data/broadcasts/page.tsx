import type { Metadata } from "next";
import { Container } from "@/components/ui/Container";
import { MessengerHeader } from "@/components/admin/messenger/MessengerHeader";
import { Composer } from "@/components/admin/messenger/Composer";
import { BroadcastHistory } from "@/components/admin/messenger/BroadcastHistory";
import { ANNOUNCEMENT_MODULE_TABS } from "@/lib/announcement-module";
import { unreadNotificationCount } from "@/lib/data-bundles/notifications";
import { broadcastAudiences } from "@/lib/broadcasts";
import { broadcastHistory } from "@/lib/messenger-broadcast";
import { listContacts, listTags } from "@/lib/messenger";
import { requireDataAdminAction } from "@/lib/data-bundles/session";

export const metadata: Metadata = { title: "Broadcast — Admin — Nickimart" };
export const dynamic = "force-dynamic";

/**
 * One message to a whole group of agents or buyers at once.
 *
 * The same composer the rest of the Messenger uses, so a broadcast is a note
 * with a wider To line rather than a different feature — and lands in the
 * same per-recipient record, so "I never got it" has the same answer whichever
 * screen it was sent from.
 */
export default async function AdminDataBroadcastsPage() {
  await requireDataAdminAction();
  const [history, groups, { contacts }, unread] = await Promise.all([
    broadcastHistory("data"),
    listTags("data"),
    listContacts("data", { perPage: 200 }),
    unreadNotificationCount(),
  ]);

  return (
    <Container className="py-8">
      <MessengerHeader scope="data" tabs={ANNOUNCEMENT_MODULE_TABS("data", unread)} />

      <div className="mt-6 space-y-4">
        <Composer
          scope="data"
          contacts={contacts.map((c) => ({
            id: c.id,
            name: c.name,
            phone: c.phone,
            email: c.email,
          }))}
          groups={groups}
          audiences={broadcastAudiences("data")}
          showAudiences
        />
        <BroadcastHistory rows={history} />
      </div>
    </Container>
  );
}
