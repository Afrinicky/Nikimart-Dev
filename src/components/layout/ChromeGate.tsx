"use client";

import { usePathname } from "next/navigation";

/**
 * Hides the storefront's own chrome — top bar, header, footer, mobile nav —
 * inside the admin and agent consoles.
 *
 * A console used to be a page on the shop: the shop's header sat above it and
 * its footer below, which was tolerable when console navigation was a row of
 * pills. It is not tolerable with a sidebar, which owns the full height of the
 * window — and on a phone the shop's bottom nav would sit under the agent's own.
 *
 * A client wrapper rather than a route group because the providers in the root
 * layout — session, cart, locations — are shared by both, and splitting the
 * tree to move four elements would mean maintaining two copies of them.
 */
const CONSOLE_PREFIXES = ["/admin", "/agent"];

export function ChromeGate({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const inConsole = CONSOLE_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
  return inConsole ? null : <>{children}</>;
}
