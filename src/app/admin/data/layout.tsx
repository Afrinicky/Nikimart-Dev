/**
 * The Data Bundles console.
 *
 * One of the admin's two consoles — the other is Retail Services. Both are
 * reached from the sidebar in /admin/layout.tsx, which is also where the role
 * guard lives and where this console's own section list is rendered when you
 * are inside it. Nothing is needed here any more: the frame belongs to the
 * shell, and each module below brings its own tabs.
 */
export default function AdminDataLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
