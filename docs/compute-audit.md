# Where the Fluid Active CPU went

Written after the 75%-of-allowance warning on 5 November 2026 (3h 34m of a 4h
monthly Fluid Active CPU allowance, with the project running at roughly
6–7 minutes of CPU a day and a flat overnight baseline).

This is the third cost audit on this project and it is worth saying what is
different about it, because the first two fixed real problems and this one was
not caused by them coming undone.

* The **Neon** audit (`One cache window, long enough to let the database
  sleep`) was about compute-hours on the database. It fixed those.
* The **bandwidth** audit (the `force-dynamic` → `revalidate = 1800` change in
  the root layout, and `/brand/logo`) was about bytes leaving the platform.
  It fixed those.
* **Fluid Active CPU** is neither. It meters the time a function's CPU spends
  actually executing — not time spent waiting on the database, and not bytes.
  So a page can be perfectly cheap in queries and in bandwidth and still be
  expensive here, if what it does between the query and the response is a lot
  of work on a lot of strings.

That is exactly the shape of what was found.

---

## The root cause: photographs are stored as text, in the page

`Product.image`, `ProductImage.url`, `Vendor.logoUrl` and `Vendor.bannerUrl`
each hold **either** a short `http(s)` URL **or** an entire picture encoded as
a base64 `data:` URL. The upload fields do that deliberately — a seller
photographs a product on a phone, `ProductImagesField` downscales it to 1200px
at JPEG quality 0.82 and posts the result inside an ordinary form. That is why
`next.config.ts` raises the server-action body limit to 6 MB.

A 1200px JPEG is roughly 180–400 KB. Base64 makes it a third larger again. So
one product row can carry **300 KB of text** in a column the storefront reads
on every listing.

`next/image` is used zero times in this codebase, so none of this was ever
going through an image pipeline. The card renders its picture as an inline
style:

```tsx
style={{ backgroundImage: `url("${imageUrl}")` }}   // ProductImagePlaceholder
```

and the product page hands its gallery to a **client** component:

```tsx
<ProductGallery images={product.images ?? []} … />
```

Every one of those is a cost multiplier:

| Step | What it costs |
| --- | --- |
| Postgres sends the column | egress, and Neon compute |
| Prisma deserialises it | CPU, proportional to length |
| `unstable_cache` serialises it | CPU — **and see below** |
| React renders it into an attribute | CPU, plus HTML escaping |
| It is a client-component prop | serialised **a second time** into the Flight payload |
| The response is compressed | CPU again, over both copies |

The `/brand/logo` route already says this out loud for the site logo:

> one measured 413 KB … Rendered in the header, the sidebar and the footer,
> that put six copies of the same image into every page the site served, and
> every page weighed 2.5 MB of which 96% was this one logo repeated.

The same disease was never treated for the catalogue, where there are hundreds
of pictures rather than one.

### The cache that was not caching

`readProductCards` and `readVendors` are both wrapped in `unstable_cache`, and
both comments explain that this is what stops the catalogue being re-read per
visitor. **Neither was working.**

Vercel refuses to store a cache entry larger than **2 MB**
([docs](https://vercel.com/docs/infrastructure/data-cache/limits-and-pricing)).
A page of base64 photographs clears 2 MB at about **eight products**. So the
entry was built — at full CPU cost — discarded, and rebuilt on the next
request, which also meant the database was being read every time after all.

That is why the earlier Neon work did not hold on the storefront.

### `/products` made it unbounded

`/products` reads its filters from the query string, so it cannot be
prerendered: `export const revalidate = 1800` has no effect on it and every
request is a fresh render. `filterProducts` had **no limit** — it returned
every matching row — and the page rendered all of them with no paging.

So one request to `/products` was: the whole catalogue, each row carrying a
photograph as text, rendered into cards, serialised twice, compressed. And
there was **no `robots.txt`**, so every crawler on the internet was free to
invent `?q=…`, `?category=…`, `?maxPrice=…` combinations, each one a guaranteed
cache miss.

---

## The second cause: a root catch-all that answers scanners

`src/app/[inviteSlug]/page.tsx` is a dynamic segment at the **root** of the
route tree, and it is `force-dynamic`. It therefore catches every single-segment
path the site does not otherwise answer.

That is not mostly people mistyping an address. A public domain is scanned
continuously for `/wp-login.php`, `/.env`, `/.git`, `/config`, `/backup`,
`/phpinfo` and a few hundred others. `normaliseInviteSlug` turns each of them
into an ordinary-looking word (`wp-login.php` → `wp-login-php`) that the
reserved list has never heard of, so each probe cost:

* two `findUnique` queries, against **two different databases**, in
  `generateMetadata`;
* the same two again in the page body;
* a full render of the not-found page inside the entire site chrome — header,
  top bar, footer, mobile nav;
* and an **HTTP 200**, which is the route's own documented trade-off — so no
  crawler ever learns to stop asking.

Nothing about that was cached, because the lookups are keyed by the path. The
work scaled with the number of strangers guessing rather than with the handful
of registration links actually issued. This is the best explanation for the
flat overnight baseline on the usage chart: scanners do not sleep.

---

## The smaller ones

* **OG card rendering.** `renderOgJpeg` ran satori + resvg and then re-encoded
  through **`mozjpeg`**, which costs several times the CPU of plain libjpeg for
  two or three percent of file size. `coverJpeg` and `squareDataUrl` also used
  `position: "attention"`, which runs an entropy pass over the whole image to
  choose a crop. None of the three OG routes set `revalidate`, so a scraper
  could make the site do all of that again.
* **The orders poll.** `LiveOrders` called `router.refresh()` every 20 seconds
  for as long as a page with an open order was visible. That is not a cheap
  poll — it is a full server render of a `force-dynamic` route, including the
  call out to the bundle provider. One person with the page open through a
  working day asked for about 1,500 of them.
* **The nightly backup.** `runDataBackup` compressed the dump with
  `gzipSync(…, { level: 9 })` — maximum compression, synchronous, on a database
  whose bulk is base64 photographs that barely compress further at any level.
* **`getVendorNameMap`.** Every catalogue page calls it to print "sold by"
  under a card. It was built from `getVendors()`, which was `findMany` with no
  `select` at all: every column of every shop, including both branding images
  **and every shop's momo and bank account details**. `mapVendor` dropped the
  payout fields on the way out, which is why nobody noticed they were being
  read.

---

## What was changed

| Change | Why |
| --- | --- |
| `src/app/img/product/[id]/route.ts`, `src/app/img/vendor/[id]/route.ts` | Serve photographs as images, not as markup — the `/brand/logo` pattern, applied to the catalogue. The URL carries an md5 of the bytes, so it is cached immutably for a year and new bytes are a new URL. |
| `src/lib/product-image-stamps.ts`, `src/lib/vendor-image-stamps.ts` | Compute that digest **in Postgres** (`md5()`, plus `length() <= 512` to pass short real URLs through untouched), so a few dozen bytes come back per image instead of a few hundred kilobytes. The `readStoredSettings` trick, generalised. |
| `CARD_SELECT` no longer selects `image` or the `images` relation | The listing query stops moving photographs. The cached entry is now small enough that `unstable_cache` actually stores it. |
| `getProductBySlug` omits `image`, resolves the gallery to links | Stops the double serialisation through the client gallery component. |
| `VENDOR_SELECT`, and a two-column `readVendorNames` | Catalogue pages stop reading branding images and payout details. |
| `filterProducts` capped at `CATALOGUE_PAGE_LIMIT` (96), with a database `count` for the total | `/products` is bounded. The page says "Showing 96 of 320" rather than silently hiding anything. |
| `src/app/robots.ts` | Turns crawlers away from everything that cannot be cached: filtered catalogue views, the consoles, anything personal, `/r/…` affiliate clicks. Slower crawl rate for the AI and SEO bots that pull hardest and send nobody back. |
| `src/app/sitemap.ts` | Aims the crawlers that remain at the pages that *are* cached. Built from a slug-only read, so producing it never pulls a photograph. |
| `[inviteSlug]` guards on a cached set of claimed paths | A scanner probe is now refused with **no query at all**. `generateMetadata` and the page share one lookup via `cache()`. The set is tagged and dropped by every invite write, so a new link works immediately. |
| `mozjpeg` and `position: "attention"` dropped; `revalidate = 86400` on all three OG routes | The expensive half of OG rendering, for a card a scraper fetches once a day. |
| `LiveOrders` backs off 20s → 40s → … → 5min, and resets on tab focus | Keeps the part that is actually useful (correct the moment somebody looks) and drops the part that was not. |
| Backup gzip level 9 → 6 | zlib's own default, and the knee of that curve. Storage is the cheap side of this trade; compute is the metered one. |

### What was deliberately not changed

* **The admin and seller product forms still read and write the real `data:`
  URLs.** They query Prisma directly rather than through `getProductBySlug`, so
  editing a listing still round-trips the actual bytes. Nothing rewrites a
  stored photograph into a `/img/…` link.
* **Category, shop and country pages are still unbounded.** They are cached for
  30 minutes, so the cost is bounded by page count rather than by traffic, and
  truncating them without paging would hide products from shoppers with no way
  to see more. Paging is the right fix and is a separate piece of work.
* **The affiliate console and the medical storefront** still read image columns
  the old way (`affiliate-catalogue.ts`, `affiliate-branding.ts`,
  `affiliate-admin.ts`, `affiliate-console.ts`, `medical/catalogue.ts`). The
  same treatment applies; they are lower traffic, and `robots.txt` now keeps
  crawlers off the console ones entirely.

---

## The switches: Admin → Settings → Performance

Everything above is a decision made once, in code. The decisions that actually
change month to month are *which features the site can afford this month*, and
those now live on a settings page rather than in a deploy.

Defined in `src/lib/settings.ts`, resolved in `src/lib/compute-rules.ts`
(tested — `compute-rules.test.ts`) and read through
`src/lib/compute-settings.ts`, which is the only module any page talks to.

| Switch | What it costs when on | What is lost when off |
| --- | --- | --- |
| **Low compute mode** | — | The panic switch. Forces the cheapest setting for everything below, at once. |
| Draw a card for each link | A layout engine and a JPEG encoder, per scrape. The most expensive thing this app does for one request. | Shared links preview with one fixed Nickimart card instead of their own. |
| Product photograph in its card | Decode + resize + re-encode of a photograph. | A shared product link shows the generic card. |
| Refresh orders screens | A full server render of a `force-dynamic` page, per tick, per open tab. | Staff reload the page themselves. |
| First refresh after *n* seconds | — | Nothing; it doubles to five minutes either way. |
| Chat bubble | A token minted for every visitor who opens it. | No live chat on the storefront. Existing conversations stay in the console. |
| Crawler policy | `open` lets crawlers walk filters and searches, none of which can be cached. | `closed` costs search traffic within days and takes weeks to recover. |
| Publish a sitemap | One cached render per window. | Crawlers guess instead, which is usually *more* expensive — leave it on. |
| Products in the sitemap | More URLs handed out at once. | Zero still lists categories and shops; crawlers find products through those. |
| Products per catalogue page | `/products` cannot be cached, so this is the ceiling on each render. | Shoppers see fewer at once and are pointed at search. |
| Answer one-word registration links | The root route that also absorbs every `/wp-login.php` scan. | Short paths stop; the long `?invite=CODE` links keep working. |
| Nightly bundle sweep | One provider call per stalled order. | A stalled order waits for somebody to spot it. The last switch to reach for. |
| Nightly exchange-rate pull | One call a night. | Yesterday's cedi rate stands — wrong in the expensive direction. Leave it on. |

Three things were deliberate in how this is built:

* **Every switch defaults to the behaviour the site already had**, so deploying
  this changes nothing until somebody decides it should.
* **Low compute mode overrides without overwriting.** The admin's own choices
  stay in the database, so clearing the panic switch restores them exactly
  rather than leaving the site stripped and somebody trying to remember what it
  looked like before.
* **An unreadable value falls back to *working*, never to off.** These are
  free-text rows in a key/value table; a typo must not be what takes the
  storefront's link previews away. The test that pins this is
  `a value nobody can read falls back to working, never to off`.

Two switches are deliberately **not** in low compute mode. Short registration
links, because an advert already printed with `/join` on it must not stop
working because the hosting bill got tight. The exchange-rate pull, because a
stale cedi rate costs more in mispriced orders than the one call saves.

Nothing on that page can take the shop offline. Browsing, search, the cart and
checkout are untouched by every setting on it, and
`no switch on this page can close the shop` is a test rather than a promise.

Automatic backups already had their own switch (`backupAutoEnabled`, in the
bundle console) and were left where they are.

---

## What to do next, if this is still not enough

In rough order of value for effort:

1. **Stop storing photographs in Postgres.** Everything above is damage
   limitation around a schema decision. Vercel Blob (or any object store) gives
   a real URL, a real CDN and a real image pipeline, and makes `next/image`
   usable. Until then every new product makes the database, the backups and the
   cache entries larger.
2. **Page the category, shop and country listings.**
3. **Audit `force-dynamic`.** 225 pages set it. Most are consoles and have to,
   but it is worth checking each one still needs to be.
4. **Consider Cache Components** (`cacheComponents` + `ensureStatic`, new in
   Next 16 — see `node_modules/next/dist/docs/01-app/02-guides/keeping-pages-static.md`).
   It would let a route mix a prerendered shell with request-time islands,
   which is what several of these pages actually want.

## How to tell whether it worked

Vercel → the project → Observability → Fluid Active CPU, grouped by **Route**.
Before this, the expectation is that `/products`, `/products/[slug]` and
`/[inviteSlug]` dominate. After a few days the first two should fall sharply
and the third should very nearly disappear. If `/[inviteSlug]` is still near the
top, the scanner traffic is heavier than assumed and the next step is to answer
those paths from the proxy instead.
