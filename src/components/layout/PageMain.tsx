"use client";

import { usePathname } from "next/navigation";

/**
 * The page's main landmark — except where the tree below supplies its own.
 *
 * A document has exactly one `<main>`. The medical tree is a second storefront
 * with its own layout and its own console shell, each of which draws its own
 * main region, so the mall's `<main>` here would be a second and a third: a
 * screen-reader user asked to "jump to the main content" is then asked which
 * one, and the answer is the shop's empty wrapper around somebody else's page.
 *
 * The same argument `ChromeGate` beside this already makes for the header and
 * the footer, for the same reason and with the same mechanism. Next.js allows a
 * second root layout only when there is no root layout at all, so a gate is
 * what lets the medical tree own its own frame while keeping the session and
 * the providers above it.
 *
 * Every prefix below is a tree whose own layout renders a `<main>`:
 *
 *   /medicals   the medical storefront's layout, and its console shell
 *   /admin      AdminShell
 *   /agent      AgentShell, and the password branch of its layout
 *   /affiliate  AffiliateShell
 *
 * Adding a prefix here is only safe once **every** route under it supplies a
 * main of its own, including the branches that render outside the shell. The
 * agent layout has one such branch — a password that arrived by text has to be
 * replaced before the console opens, and that screen deliberately renders
 * without the sidebar — and it was given its own `<main>` when this prefix was
 * added, because standing this one down without that would have left the page
 * with no main region at all. Two is a defect; none is worse.
 */
const SUPPLIES_OWN_MAIN = ["/medicals", "/admin", "/agent", "/affiliate"];

export function PageMain({
  className,
  children,
}: {
  className?: string;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const ownsIt = SUPPLIES_OWN_MAIN.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );

  // A plain wrapper, not nothing: the flex sizing is what keeps a short page's
  // footer at the bottom of the window, and dropping the element would collapse
  // every medical page's layout.
  if (ownsIt) return <div className={className}>{children}</div>;
  return <main className={className}>{children}</main>;
}
