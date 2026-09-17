import { AdminShell } from "@/components/admin/AdminShell";
import { requireDashboard } from "@/lib/session";

/**
 * The admin console's frame. The shell — sidebar, top bar, collapse — is a
 * client component because it remembers how this browser likes it; the guard
 * stays here, on the server, where it cannot be argued with.
 */
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const user = await requireDashboard("/admin");

  return (
    <AdminShell user={{ name: user.name, email: user.email }}>{children}</AdminShell>
  );
}
