/**
 * The agent Products screen's tabs.
 *
 * A pure module, not part of the client component that renders them: the page
 * is a server component and has to validate `?tab=` before deciding what to
 * render. Anything exported from a "use client" file is a client reference,
 * and calling one from the server throws at request time — the same reason
 * store-tabs lives on its own.
 */
export const SERVICE_TABS = ["catalogue", "pricing", "orders", "flyer"] as const;

export type ServiceTab = (typeof SERVICE_TABS)[number];

export function isServiceTab(value: unknown): value is ServiceTab {
  return typeof value === "string" && (SERVICE_TABS as readonly string[]).includes(value);
}
