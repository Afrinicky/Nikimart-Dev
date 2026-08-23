/**
 * Store-slug normalisation, as a pure module.
 *
 * The same rule has to run in two places — the browser, to preview the link as
 * it's typed, and the server, to decide what actually gets saved. `agents.ts`
 * is server-only (it imports Prisma), so the rule itself lives here and both
 * sides call it.
 */
export function normaliseSlugClient(raw: string): string {
  return raw
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/-{2,}/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 40);
}
