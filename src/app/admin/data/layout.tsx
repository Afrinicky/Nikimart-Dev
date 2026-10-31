import { AdminShell } from "@/components/admin/AdminShell";
import { requireDataAdmin } from "@/lib/data-bundles/session";

/**
 * The Data Bundles console's own frame.
 *
 * It sits beside `(retail)` rather than inside it, so that nothing above this
 * file belongs to the mall. The URL is unchanged — a route group in
 * parentheses is invisible to the router — but the layout chain is not: this
 * console no longer renders the retail layout, no longer passes its guard, and
 * no longer needs the retail database to be reachable for anybody to open it.
 * Before this, an administrator with a perfectly good bundle session was still
 * bounced to the mall's sign-in.
 *
 * The shell is the same component the retail console uses, deliberately. It
 * already tells the two apart by pathname and renders this console's own
 * navigation, so sharing it keeps one chrome rather than growing a second one
 * that would drift.
 *
 * What is *not* shared is the enquiry dock. That inbox is the mall's, it reads
 * the mall's database, and putting it here would hand this console a retail
 * dependency through the back door after all the work of taking them out.
 */
export default async function AdminDataLayout({ children }: { children: React.ReactNode }) {
  const user = await requireDataAdmin();

  return (
    <AdminShell user={{ id: user.id, name: user.name, email: user.email }}>
      {children}
    </AdminShell>
  );
}
