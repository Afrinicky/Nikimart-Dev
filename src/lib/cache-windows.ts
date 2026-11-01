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
 * Pages are not configured from here, and cannot be.
 *
 * A page's own window is `export const revalidate`, which is route segment
 * config, and Next requires those exports to be *statically analyzable*: a
 * literal and nothing else. Not an imported constant, not even `30 * 60` —
 * the docs give exactly that as the counter-example, in
 * node_modules/next/dist/docs/01-app/02-guides/caching-without-cache-components.md.
 * Importing a constant here type-checked perfectly and then failed the
 * production build with "Invalid segment configuration export detected", which
 * is the kind of thing worth writing down once rather than rediscovering.
 *
 * So each cached page carries the literal 1800 with a comment pointing back at
 * `CACHE_BACKSTOP`. The two are kept in step by convention, because the
 * language of the framework does not allow anything better. If you change the
 * number here, change it there:
 *
 *     grep -rn "export const revalidate" src/app
 *
 * They should match, and for the same reason: a page that re-renders every
 * minute over reads half an hour old produces identical HTML and still touches
 * the database through everything uncached, which is pure cost.
 */
