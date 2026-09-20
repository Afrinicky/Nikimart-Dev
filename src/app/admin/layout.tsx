import { AdminShell } from "@/components/admin/AdminShell";
import { requireDashboard } from "@/lib/session";
import { AdminChatDock } from "@/components/chat/AdminChatDock";
import { getDockEnquiries } from "@/lib/chat/inbox";
import { currentViewer } from "@/lib/chat/viewer";
import { isChatConfigured } from "@/lib/chat/ably";

/**
 * The admin console's frame. The shell — sidebar, top bar, collapse — is a
 * client component because it remembers how this browser likes it; the guard
 * stays here, on the server, where it cannot be argued with.
 */
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const user = await requireDashboard("/admin");

  // Enquiries follow the admin around the console rather than waiting on a tab
  // they have to remember to open.
  const [enquiries, viewer] = await Promise.all([getDockEnquiries(), currentViewer()]);

  return (
    <AdminShell user={{ id: user.id, name: user.name, email: user.email }}>
      {children}
      {isChatConfigured() && viewer ? (
        <AdminChatDock enquiries={enquiries} me={{ key: viewer.key, name: viewer.name }} />
      ) : null}
    </AdminShell>
  );
}
