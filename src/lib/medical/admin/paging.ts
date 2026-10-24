/**
 * Reading `page` and `per` out of a URL.
 *
 * Lives here rather than beside `ConsolePager`, which is a client component:
 * anything exported from a `"use client"` module is a client function, and a
 * server component calling one fails at render with "Attempted to call
 * readPaging() from the server". Every console list page is a server component
 * and every one of them needs this, so it belongs in a module with no
 * directive at all — importable from both sides.
 */

export const PER_PAGE_OPTIONS = [10, 25, 50, 100] as const;
export const DEFAULT_PER_PAGE = 25;

export function readPaging(
  query: Record<string, string | string[] | undefined>,
): { page: number; perPage: number; skip: number } {
  const pageRaw = Number(Array.isArray(query.page) ? query.page[0] : query.page);
  const perRaw = Number(Array.isArray(query.per) ? query.per[0] : query.per);
  const page = Number.isInteger(pageRaw) && pageRaw > 0 ? pageRaw : 1;
  // Clamped to the offered options. A hand-edited `?per=100000` is a query
  // that tries to read the whole table into memory.
  const perPage = (PER_PAGE_OPTIONS as readonly number[]).includes(perRaw)
    ? perRaw
    : DEFAULT_PER_PAGE;
  return { page, perPage, skip: (page - 1) * perPage };
}
