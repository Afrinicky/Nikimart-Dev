"use client";

import { usePathname } from "next/navigation";

/**
 * Hides the storefront's own chrome — top bar, header, footer, mobile nav —
 * inside the admin, agent and affiliate consoles.
 *
 * A console used to be a page on the shop: the shop's header sat above it and
 * its footer below, which was tolerable when console navigation was a row of
 * pills. It is not tolerable with a sidebar, which owns the full height of the
 * window — and on a phone the shop's bottom nav would sit under the agent's own.
 *
 * A client wrapper rather than a route group because the providers in the root
 * layout — session, cart, locations — are shared by both, and splitting the
 * tree to move four elements would mean maintaining two copies of them.
 *
 * `/medicals` is here for a different reason: it is not a console but a second
 * storefront, with its own header, its own footer and its own palette. The
 * mall's chrome above a medical catalogue would be two headers and two brands
 * on one page. Next.js only allows a second root layout when there is no root
 * layout at all, so the gate is what gives the medical tree its own chrome
 * while it keeps the session and the providers above it.
 */
const CONSOLE_PREFIXES = ["/admin", "/agent", "/affiliate", "/medicals"];

export function ChromeGate({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const inConsole = CONSOLE_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
  return inConsole ? null : <>{children}</>;
}
