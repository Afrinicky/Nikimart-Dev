import type { Metadata } from "next";
import { Container } from "@/components/ui/Container";
import { MessengerHeader } from "@/components/admin/messenger/MessengerHeader";
import { ContactsPanel } from "@/components/admin/messenger/ContactsPanel";
import { ANNOUNCEMENT_MODULE_TABS } from "@/lib/announcement-module";
import { countOpenComplaints } from "@/lib/retail/complaints";
import { loadContacts } from "@/lib/messenger-page";
import { requireAdmin } from "@/lib/session";

export const metadata: Metadata = { title: "Contacts — Messenger — Admin — Nickimart" };
export const dynamic = "force-dynamic";

export default async function RetailMessengerContactsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; tag?: string; archived?: string }>;
}) {
  await requireAdmin();
  const params = await searchParams;
  const filter = {
    query: (params.q ?? "").trim(),
    tag: (params.tag ?? "all").trim(),
    archived: params.archived === "1",
  };

  const [data, open] = await Promise.all([loadContacts("retail", filter), countOpenComplaints()]);

  return (
    <Container className="py-8">
      <MessengerHeader scope="retail" tabs={ANNOUNCEMENT_MODULE_TABS("retail", 0, open)} />
      <div className="mt-6">
        <ContactsPanel
          scope="retail"
          contacts={data.contacts}
          total={data.total}
          groups={data.groups}
          audiences={data.audiences}
          query={filter.query}
          tag={filter.tag}
          archived={filter.archived}
          exportHref="/admin/messenger/contacts/export"
        />
      </div>
    </Container>
  );
}
