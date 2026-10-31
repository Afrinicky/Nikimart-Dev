import { requireDataAdmin } from "@/lib/data-bundles/session";

/**
 * The Data Bundles console.
 *
 * It has its own guard now, reading this business's own `DataUser` table, so
 * that everything below it answers to the bundle database and not the mall's.
 * That is what lets the console keep working through a retail outage, which
 * is the whole point of the split.
 *
 * One honest caveat, until the routing catches up: this tree still sits under
 * /admin, so `src/app/admin/layout.tsx` — and its retail `requireDashboard`
 * — renders first and will send somebody to the mall's sign-in before this
 * guard is ever reached. An administrator therefore still needs both sessions
 * to open this console by its current URL. Moving the console out from under
 * the retail shell is what removes that, and it is a routing change rather
 * than a database one: nothing below here reads the mall any more.
 */
export default async function AdminDataLayout({ children }: { children: React.ReactNode }) {
  await requireDataAdmin();
  return <>{children}</>;
}
