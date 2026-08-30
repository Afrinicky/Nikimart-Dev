# Nickimart

Nickimart is an online shopping mall connecting buyers to local shops, sellers
sourcing from abroad, campus vendors, food vendors, service providers, and
official Nickimart products across Ghana.

Built with **Next.js 16** (App Router), **Tailwind CSS v4**, **Prisma**, and
**Auth.js (NextAuth v5)**.

## Getting started (local)

Requires a PostgreSQL database. You can run one locally or point at any hosted
Postgres.

```bash
# 1. Install dependencies (runs `prisma generate` automatically)
npm install

# 2. Configure environment
cp .env.example .env
# set DATABASE_URL to your Postgres connection string
# set AUTH_SECRET — generate one with: npx auth secret

# 3. Create the database schema
npm run db:migrate

# 4. Seed demo data (catalog + demo accounts)
npm run db:seed

# 5. Start the dev server
npm run dev
```

Open http://localhost:3000.

## Deploying to Vercel

The app needs a **hosted Postgres** database — SQLite does not work on Vercel's
serverless runtime. Vercel Postgres, Neon, Supabase, or Railway all work.

1. **Provision Postgres.** In your Vercel project, add a Postgres database
   (Storage → Create → Postgres). This injects `DATABASE_URL` automatically. If
   you use another provider, copy its connection string instead.
2. **Set environment variables** (Project → Settings → Environment Variables):
   - `DATABASE_URL` — your Postgres connection string.
   - `AUTH_SECRET` — a long random string (`npx auth secret`). **Login returns a
     500 error if this is missing.**
   - `AUTH_TRUST_HOST` — `true`.
3. **Deploy.** The build succeeds and the storefront is live. Pages that use the
   database (login, dashboards) are server-rendered on demand.
4. **Create the tables — run once** from your machine, pointing at the
   production database (use the direct / non-pooled URL if your provider gives
   one):
   ```bash
   DATABASE_URL="<your-production-url>" npx prisma migrate deploy
   ```
5. **Seed (optional, once)** to load the catalog and demo accounts:
   ```bash
   DATABASE_URL="<your-production-url>" npm run db:seed
   ```
   New customers can also just register at `/register` without seeding.

> **No local setup / can't open a direct DB connection?** Run
> `npm run db:setup-sql` to generate `nikimart-neon-setup.sql`, then paste it
> into your provider's SQL editor (e.g. the Neon SQL Editor). It creates the
> schema **and** seeds the demo data in one shot, and is safe to re-run.

> **Neon + Prisma note:** set the runtime `DATABASE_URL` to the **unpooled /
> direct** connection string (Neon exposes it as `..._URL_UNPOOLED`). If you use
> the pooled URL instead, append `?pgbouncer=true` or Prisma will error with
> "prepared statement already exists".

### Applying schema changes after a deploy

**A green deploy does not mean the schema is up to date.** The build never
touches the database, so a release that adds columns will deploy cleanly and
then fail at runtime — usually as an empty or "couldn't load" state, because the
data loaders swallow query errors rather than 500 the page.

After deploying a release that changes `prisma/schema.prisma`, apply the
migration:

```bash
DATABASE_URL="<your-production-url>" npx prisma migrate deploy
```

Or, if you can't open a direct connection, paste the matching
`nikimart-neon-*.sql` catch-up file into the Neon SQL Editor. Each one is
idempotent, and records itself in `_prisma_migrations` so a later
`migrate deploy` skips it rather than re-running it.

| Release | Catch-up file |
| ------- | ------------- |
| Affiliate programme, product archiving | `nikimart-neon-affiliate-products.sql` |
| CBM shipping routes | `nikimart-neon-shipping-cbm.sql` |
| Shipped from Abroad (arrival points, rates, landed-cost columns) | `db/migrations/0005_shipped_from_abroad.sql` — applied automatically at build |
| Commission + seller payouts | `nikimart-neon-commission.sql` |
| Affiliates (Finance console) | `nikimart-neon-affiliates.sql` |
| Data bundle storefront | `nikimart-neon-data-bundles.sql` |

## Demo accounts

The seed creates one account per role. **Password for all: `password123`.**

| Role     | Email                    | Lands on   |
| -------- | ------------------------ | ---------- |
| Customer | customer@nikimart.test   | `/account` |
| Seller   | seller@nikimart.test     | `/seller`  |
| Admin    | admin@nikimart.test      | `/admin`   |
| Freight  | freight@nikimart.test    | `/freight` |
| Pickup   | pickup@nikimart.test     | `/pickup`  |

You can also register a brand-new customer at `/register`.

## Authentication & roles

- **Auth.js (NextAuth v5)** with a Credentials provider and JWT sessions.
- Passwords are hashed with `bcryptjs`.
- The signed-in user's role is carried on the session and used to gate the
  dashboards. Roles live in `src/lib/roles.ts`.
- `src/proxy.ts` (Next.js proxy/middleware) enforces role access on every
  dashboard route; each dashboard page re-checks with `requireDashboard()` as
  defence in depth.
- Authorisation reads the role **from the database**, not from the JWT claim
  (`src/lib/session.ts`, cached per request). The token's role is only as fresh
  as the last sign-in, so demoting an admin or deleting an account takes effect
  immediately rather than whenever the token happens to expire.
- Sign-in, registration, and password-reset codes are rate limited
  (`src/lib/rate-limit.ts`). Counters are per-process, so on serverless they
  reduce rather than eliminate guessing; move them to Redis if traffic warrants.

| Dashboard  | Allowed roles          |
| ---------- | ---------------------- |
| `/account` | all signed-in users    |
| `/seller`  | Seller, Admin          |
| `/admin`   | Admin                  |
| `/freight` | Freight, Admin         |
| `/pickup`  | Pickup, Admin          |

## Admin console

Signed in as an **Admin**, `/admin` is a full operator console (tabbed shell):

- **Products / Shops / Categories / Users** — create, edit, delete; shops have
  verify/unverify; users have role assignment.
- **Orders** — inline status changes.
- **Data** — the data bundle storefront: prices, orders, AFA (see below).
- **Pages** — a section-based **page builder** (see below).

All admin mutations run through admin-only server actions (`requireAdmin`) and
revalidate the storefront, so edits appear on the public site immediately.

Every metric on the `/admin` overview links through to the list it counts, and
the Users and Shops tabs accept `?role=` / `?status=` filters so a tile and its
destination always agree.

### Excel exports

Products, Shops, Categories, Users, Orders, Finance, Affiliates, Locations,
Pickup, and Shipping each have an **Export to Excel** button that downloads a
real `.xlsx` from `/admin/export/<dataset>` (admin-only). The workbooks carry
the full picture, not just the visible columns — Orders ships a line-item sheet,
Finance ships the settlement, payout, and commission ledgers, Affiliates ships
the enrolled-product catalogue. The writer (`src/lib/xlsx.ts`) emits the
spreadsheet directly, so there's no spreadsheet dependency in the bundle.

### Deleting vs archiving

Deleting a record that carries money is refused or downgraded to an archive:

- A product that has ever been ordered is **archived** (hidden from the
  storefront and from affiliate catalogues) instead of deleted, because
  deleting it would take its order items — and every payout, commission, and
  GMV figure derived from them — with it. Products that never sold are deleted.
- An account with orders, a shop, or an affiliate record can't be deleted;
  orders cascade from `User`.
- Orders can only be deleted once **cancelled**. Cancelling also returns the
  reserved stock.

## Page builder

The homepage (and any custom page under `/pages/<slug>`) is composed of ordered
**section blocks** stored in the DB (`Page` / `PageSection`). From
`/admin/pages` an admin can reorder, show/hide, edit, and add/remove blocks
(hero, category grid, product rails bound to a collection, shop rails, campus,
rich text, banners). Until a page is initialised in the DB the storefront falls
back to built-in defaults, so the site renders even before the tables exist.

## Affiliate programme

Affiliates earn on **individual products that are enrolled in the programme**,
never on the whole catalogue — and every enrolment records who pays for it.

- **A seller enrols their own product** (asked when listing, editable later).
  The commission comes out of the seller's net earnings, at whatever rate they
  set. Their rate is honoured in full, clamped only so a sale can never cost
  them money. Un-enrolling removes the product from every affiliate's catalogue
  immediately; commission already earned is untouched.
- **An admin enrols a product** from the admin product page. Nickimart funds the
  commission out of its own cut, and the rate is **capped at half the platform
  commission charged on that item** — the house always keeps at least half of
  what it earns. The cap is enforced in `src/lib/affiliate-commission.ts` and
  covered by `npm test`.

Rates resolve **product → category → programme default**. Admins set the
programme default and per-category defaults (Settings and Categories), and the
public "earn up to X%" headline is configurable text in Settings
(`affiliatePitch`, with `{rate}` filled from `affiliateMaxRate`).

The affiliate dashboard at `/affiliate` lists every enrolled product with what
the affiliate earns per sale, and a share sheet per product — copy link,
WhatsApp, Facebook, Instagram, TikTok, X, Telegram, email, and the native share
sheet. Each link is the product page carrying the affiliate's code
(`/products/<slug>?ref=CODE`), captured into a 30-day cookie on landing and read
back at checkout.

Commission is snapshotted per order item at sale time (rate, amount, funder), so
later enrolment changes never rewrite past payouts. It **clears on delivery**,
mirroring seller settlements, so a payout is never made against an order that
can still be cancelled.

## Shipped from Abroad

Replaces the old preorder system, and absorbs the old Global Shopping page.
A preorder was a window that closed; this is dropshipping that never does. A
seller finds an item on Alibaba (or anywhere), copies its details and link, and
lists it at **`/shipped-from-abroad`**; buyers can order at any time and the
seller sources it once they do.

### The three freight legs

Freight is billed as three separate legs because three different people quote
them:

1. **Supplier → freight forwarder abroad.** The seller knows this figure and
   types it on the listing (GH₵ per unit).
2. **Forwarder → a Ghana arrival point**, by air, sea, road or express courier.
   Admins configure the points (`/admin/arrival-points`) and a rate table per
   origin and mode — ₵/CBM for sea, ₵/kg for air, with a minimum charge. Import
   duty and clearing are settled here. A seller with their own forwarder deal
   can override the rate on the listing.
3. **Arrival point → the buyer's pickup station.** The existing CBM route
   engine, starting from the arrival point's hub rather than the seller's.

A seller whose supplier already quoted a delivered-to-Ghana price ticks
**freight included**; legs 1 and 2 are then charged at zero rather than
double-billing the buyer, and the arrival point still matters because leg 3
starts there.

### Tax

Both jurisdictions are billed. Sales tax charged in the country of purchase is a
per-listing rate on the goods. Ghana import duty is assessed on the CIF value
(goods plus the freight that got them here), and Ghana VAT and levies on that
value plus the duty — customs practice, not intuition. Duty is per arrival
point; the VAT rate and a fallback duty are platform settings.

### Paying now or on arrival

Where the platform and the seller both allow it, a buyer may settle the goods,
the tax at source and leg 1 today and pay leg 2, duty, Ghana tax and leg 3 when
the item lands — **at the rates in force then**, which the checkout says plainly
before they choose it. Paying in full locks the freight, so a later rate rise is
the platform's. The order stores which plan was chosen, what was paid and what
is outstanding.

### Tracking and notifications

An imported consignment has two milestones a domestic one does not — *at the
freight forwarder* and *arrived in Ghana* — because otherwise a buyer stares at
"in transit" for six weeks. Sellers are alerted on **both SMS and email** for
every new order regardless of the staff-channel setting; buyers get their own
message when the goods land in Ghana (carrying any balance now due) and again
when they are handed over.

### Where the code lives

| Concern | Module |
| --- | --- |
| Terms parse/serialise, the two spellings of the product type | `src/lib/abroad.ts` |
| The landed-cost maths (pure, unit-tested) | `src/lib/abroad-costs.ts` |
| Arrival points and rate resolution (pure) | `src/lib/arrival-points.ts` |
| Cart pricing, server-side | `src/lib/abroad-pricing.ts` |
| Admin CRUD for points and rates | `src/lib/arrival-point-actions.ts` |

Listings created before the rename are stored as `productType: "preorder"` and
are **never backfilled** — migrations here are additive by rule (see
`db/migrations/README.md`). Both values mean the same thing and the code, not
the database, reconciles them: read with `isAbroadType`, query with
`ABROAD_TYPES`, write with `SHIPPED_FROM_ABROAD`. `/preorders` and
`/global-shopping` permanently redirect to `/shipped-from-abroad`.

## Data bundles

Nickimart sells internet data bundles alongside the mall, on its own storefront at
**`/data-bundles`** — MTN, Telecel, AirtelTigo iShare and AirtelTigo BigTime.
Buyers no longer leave the site for an external agent storefront.

It is deliberately its own world. Bundles are not `Product` rows, bundle orders
are not `Order` rows, and nothing about them touches the cart, shipping, pickup
points, or seller settlements. What they *do* share is Nickimart's infrastructure:
the same Paystack account collects the money and the same Arkesel sender texts
the buyer.

**Buying** (no account needed — a phone number is the whole identity):

1. Pick a network and a size. The price comes from the database, never the page.
2. Enter the number to top up. The network is checked against the number's prefix
   before payment, because data sent to the wrong network can't be reversed.
3. Pay through Paystack (MoMo or card). On confirmation the order is handed to
   the provider and the buyer gets an SMS; `/data-bundles/orders` tracks it by
   reference or phone number.

**AFA registration** is sold the same way at `/data-bundles/afa` — pay, then the
details are submitted upstream for approval.

### Fulfilment

Orders are fulfilled through the **Justice Datashop** agent API
(`https://backend.justicedatashop.com`, `X-API-Key`). `src/lib/data-bundles/`
holds the whole feature: `provider.ts` (the API client), `catalog.ts` (prices),
`fulfillment.ts` (settle payment → dispatch → notify), and the public and admin
actions.

Money in and data out are separate steps on purpose. Payment settles with a
guarded `updateMany`, so the Paystack redirect and the Paystack webhook racing
each other still dispatch exactly once — and a dispatch that fails upstream
leaves a **paid** order the admin can retry, rather than a lost sale. Provider
prices arrive in pesewas and are converted once, in the client.

Each order registers a status callback at `/api/data-bundles/webhook`, so
deliveries confirm themselves with nothing to set up. The URL carries the
order's reference plus a token derived from it by HMAC, keyed by `AUTH_SECRET` —
so a callback URL that leaks proves nothing about any other order, and the
endpoint rejects anything whose token doesn't match its reference.

### Admin

`/admin/data` is a section of the existing admin console (same shell, same
`requireAdmin` guard) with five tabs:

- **Overview** — agent wallet balance, today's takings, in-flight and failed
  orders, revenue against provider cost, and a setup checklist.
- **Bundle prices** — the price table per network. Record the provider's cost
  beside each size and the margin is worked out as you type; "Price from cost"
  re-prices a whole network at a markup in one move.
- **Bundle orders** — filter by status, search by reference or phone, and per
  order: send now, refresh from the provider, mark refunded.
- **AFA** — registrations and their approval status.
- **Store settings** — store name, tagline, open/closed, support WhatsApp, the
  AFA fee, and the default markup.

Prices ship seeded with a **placeholder** ladder so the store is never empty.
Check every row against your agent cost in **Admin → Data → Bundle prices**
before advertising the store.

### Setup

1. Run `nikimart-neon-data-bundles.sql` on the database (tables + seed ladder +
   settings). It's idempotent and never overwrites prices you've already set.
2. Generate an API key at justicedatashop.com → Developer → Authentication and
   set `JUSTICE_API_KEY`.
3. Point Paystack's webhook at `https://<your-domain>/api/paystack/webhook`
   (Paystack dashboard → Settings → API Keys & Webhooks). It settles orders
   where the buyer closed the browser before the redirect finished, and serves
   the mall and the bundle store alike.
4. Keep the agent wallet funded — every bundle you sell is bought from it. A
   daily sweep (`/api/cron/data-bundles`, in `vercel.json`) texts admins when it
   drops below the threshold in Store settings, re-drives orders that were paid
   but never reached the provider, and re-checks ones the provider never
   confirmed. **Run checks now** on the overview does the same on demand. Raise
   it to hourly (`0 * * * *`) on a Vercel plan above Hobby, which refuses to
   deploy crons that run more than once a day.

Without `JUSTICE_API_KEY` the storefront still takes orders; they queue as paid
and undispatched until the key is added and you press **Send now**.

## Data model

Prisma schema (`prisma/schema.prisma`) covers the Auth.js tables plus the
application domain: `Category`, `Vendor`, `Product`, `Order`, `OrderItem`,
`PickupPoint`, `Shipment`, the page builder (`Page`, `PageSection`,
`SiteSetting`), and the data bundle storefront (`DataBundle`, `DataOrder`,
`AfaRegistration`). The datasource is PostgreSQL in every environment; set
`DATABASE_URL` accordingly.

## Useful scripts

| Script            | Description                          |
| ----------------- | ------------------------------------ |
| `npm run dev`     | Start the dev server                 |
| `npm run build`   | Production build                     |
| `npm run lint`    | Run ESLint                           |
| `npm test`        | Run the unit tests (Node test runner)|
| `npm run db:migrate` | Create/apply Prisma migrations    |
| `npm run db:seed` | Seed demo data                       |
| `npm run db:reset`| Drop, re-migrate, and re-seed the DB |
