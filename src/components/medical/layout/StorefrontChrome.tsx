"use client";

import { usePathname } from "next/navigation";

/**
 * Hides the storefront's header and footer inside the medical console.
 *
 * `/medicals/admin` is nested under `/medicals`, so it inherits that layout —
 * and without this the console renders beneath the shop's utility bar, search
 * and category nav, with its own full-height sidebar starting a hundred and
 * fifty pixels down the page. Two sets of chrome, two brands, one screen.
 *
 * A client gate rather than a route group, for the same reason the mall's
 * `ChromeGate` is one: the providers above — session, basket — are shared by
 * the shop and the console, and splitting the tree to move two elements would
 * mean maintaining two copies of them. The console draws its own frame.
 */
export function StorefrontChrome({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const inConsole = pathname === "/medicals/admin" || pathname.startsWith("/medicals/admin/");
  return inConsole ? null : <>{children}</>;
}
