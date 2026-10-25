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
 * Scoped deliberately to `/medicals`. The retail consoles render a `<main>` in
 * their own shells too and so carry the same duplication, but that is theirs to
 * fix: changing it here would change the markup of pages this work was asked
 * not to touch.
 */
const SUPPLIES_OWN_MAIN = ["/medicals"];

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
