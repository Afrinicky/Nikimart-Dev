/**
 * The Store screen's tabs.
 *
 * A pure module, not part of the client component that renders them: the page
 * is a server component and has to validate `?tab=` before deciding what to
 * render. Anything exported from a "use client" file is a client reference, and
 * calling one from the server throws at request time.
 */
export const STORE_TABS = ["overview", "link", "pricing", "afa", "withdrawals"] as const;

export type StoreTab = (typeof STORE_TABS)[number];

export function isStoreTab(value: unknown): value is StoreTab {
  return typeof value === "string" && (STORE_TABS as readonly string[]).includes(value);
}
