import type { Metadata } from "next";
import { Container } from "@/components/ui/Container";
import { MessengerHeader } from "@/components/admin/messenger/MessengerHeader";
import { Composer } from "@/components/admin/messenger/Composer";
import { BroadcastHistory } from "@/components/admin/messenger/BroadcastHistory";
import { ANNOUNCEMENT_MODULE_TABS } from "@/lib/announcement-module";
import { countOpenComplaints } from "@/lib/retail/complaints";
import { broadcastAudiences } from "@/lib/broadcasts";
import { broadcastHistory } from "@/lib/messenger-broadcast";
import { listContacts, listTags } from "@/lib/messenger";
import { requireAdmin } from "@/lib/session";

export const metadata: Metadata = { title: "Broadcast — Admin — Nickimart" };
export const dynamic = "force-dynamic";

/**
 * Sending something to a group of people on purpose.
 *
 * The difference from an announcement is worth keeping in mind while writing
 * one: an announcement waits on a screen, a broadcast arrives on a phone at
 * whatever hour it was sent, costs money per recipient, and cannot be
 * recalled. So the history below is not a nicety — it is the only record of
 * what several thousand people were told.
 *
 * It uses the Messenger's own composer, so a broadcast is the same act as a
 * note to one person with a wider To line: the same groups, the same preview,
 * the same per-recipient record afterwards. A separate composer here was how
 * "did she get it?" had two different answers depending which screen sent it.
 */
export default async function AdminRetailBroadcastsPage() {
  await requireAdmin();
  const [history, groups, { contacts }, open] = await Promise.all([
    broadcastHistory("retail"),
    listTags("retail"),
    listContacts("retail", { perPage: 200 }),
    countOpenComplaints(),
  ]);

  return (
    <Container className="py-8">
      <MessengerHeader scope="retail" tabs={ANNOUNCEMENT_MODULE_TABS("retail", 0, open)} />

      <div className="mt-6 space-y-4">
        <Composer
          scope="retail"
          contacts={contacts.map((c) => ({
            id: c.id,
            name: c.name,
            phone: c.phone,
            email: c.email,
          }))}
          groups={groups}
          audiences={broadcastAudiences("retail")}
          showAudiences
        />
        <BroadcastHistory rows={history} />
      </div>
    </Container>
  );
}
