/**
 * How long a cached read may go without asking the database again.
 *
 * These numbers are a backstop and nothing more. Every cached read in this
 * codebase carries a tag, and every write that changes what it reads calls
 * `updateTag` for that tag, so an edit in a console is visible on the
 * storefront immediately — not when a window happens to lapse. What the window
 * catches is the case nothing else can: data changed *outside* the app, by SQL
 * run by hand or by a restore.
 *
 * Why they used to be short, and why that cost us a week
 * -----------------------------------------------------
 * They were 60, 120 and 300 seconds, each read on its own schedule. Neon
 * suspends a compute that has been idle for about five minutes, and with
 * windows that short and staggered there was a query every minute or so and
 * therefore never a five-minute gap. The retail project was awake roughly 440
 * of the 730 hours in October, spent its 100 CU-hour allowance, and was
 * suspended for the rest of the month: nobody could sign in and the storefront
 * served an empty catalogue out of cache.
 *
 * So: one window, shared, long enough that quiet periods are genuinely quiet,
 * and the same value everywhere so the reads expire *together*. Staggered
 * windows are the thing to avoid — three caches lapsing at three different
 * moments wake the database three times and hold it up in between, where one
 * shared expiry wakes it once and lets it sleep again.
 *
 * This only buys back the quiet hours. 179 pages are `force-dynamic` and query
 * on every request, so while people are actually using the site the database is
 * up regardless, as it should be. Overnight is where the allowance was going.
 */

/** The ordinary backstop: thirty minutes. */
export const CACHE_BACKSTOP = 30 * 60;

/**
 * For reads whose answer is measured in weeks — a logo, a legal page. An hour
 * is already generous and there is nothing to gain by shortening it.
 */
export const CACHE_BACKSTOP_LONG = 60 * 60;

/**
 * What a cached *page* may serve before it re-renders.
 *
 * Distinct from the two above because it governs a different thing: the page
 * cache holds rendered HTML, and re-rendering is what goes back to the reads
 * underneath. A page that re-renders every minute over reads that are an hour
 * old is just work — it produces identical HTML and still touches the database
 * through anything not cached. Matching the backstop keeps the two in step.
 */
export const PAGE_BACKSTOP = CACHE_BACKSTOP;
