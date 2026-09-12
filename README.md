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
| CBM shipping routes (superseded by `0006`) | `nikimart-neon-shipping-cbm.sql` |
| Shipped from Abroad (arrival points, rates, landed-cost columns) | `db/migrations/0005_shipped_from_abroad.sql` — applied automatically at build |
| One shipping system (consolidation points, rules, forwarders) | `db/migrations/0006_shipping_hub.sql` — applied automatically at build |
| Per-seller local fees, forwarder routes, currencies, MOQ | `db/migrations/0007_shipping_simplification.sql` — applied automatically at build |
| Forwarders rebuilt (their own Ghana points, rate grid, order placement) | `db/migrations/0008_freight_forwarder_rebuild.sql` — applied automatically at build |
| Exchange rates that fetch themselves | `db/migrations/0009_currency_auto_rates.sql` — applied automatically at build |
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

Signed in as an **Admin**, `/admin` is an operator console split into **two
consoles**, chosen from the switcher at the top of the shell:

- **Retail Services** (`/admin`) — the mall. Products, shops, categories, users,
  orders, finance, affiliates, pages, locations, pickup, shipping, order
  placement, FAQs, policies and settings.
- **Data Bundles** (`/admin/data`) — the bundle business. Prices, orders, AFA,
  agents, referrals, withdrawals, announcements, agent support and its own
  settings (see below).

They are two businesses that share a sign-in and nothing else — separate
databases, separate Paystack accounts, separate staff who care about them — so
each gets its own place rather than one being a tab among the other's eighteen.
Each console shows only its own tabs; the switcher is the only navigation they
share.

Inside Retail Services:

- **Products / Shops / Categories / Users** — create, edit, delete; shops have
  verify/unverify; users have role assignment.
- **Orders** — inline status changes.
- **Order placement** — when to buy the imported goods, and the record of having
  bought them (see below).
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
- A **freight forwarder** is the exception, and deliberately: deleting one
  deletes their consolidation points, classes, lanes and rates too. Listings
  that pointed at any of it keep their own record and are left pointing at
  nothing, which the listing form then asks the seller to fix.

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

## Shipping

One console, one fee, one number the buyer sees.

Shipping configuration used to live in three places — a rate matrix under
Shipping, an Arrival points tab, and a slice of Settings — so nobody could see a
fee's whole configuration at once and a rate set in one place could quietly
contradict a rate set in another. It is all under **`/admin/shipping`** now, in
five screens: Overview (the platform defaults), Local points, Inside Ghana,
Forwarders, and Currencies. When to actually *buy* the imported goods is its own
console: **`/admin/purchasing`**.

### The journey

Every order is collected. Goods are gathered at a **consolidation point** — a
seller's Kumasi store, a supplier's Accra receiving depot, Tema Port — checked
there, and couriered to the **pickup station** the buyer chose.

A consolidation point may *sit at* a pickup station, and that link is the point
of the whole model: when it does, a buyer collecting there pays **nothing**,
because the goods are already in the room. Nobody configures a zero.

Points come in two kinds, and the difference is **ownership**. A *local* point
is NikiMart's, created under `/admin/shipping/points`. An *international* point
is a freight forwarder's own warehouse in Ghana, created on their registration
page and usable by nobody else — two forwarders sharing one was always a fiction,
and it is what let a seller pick a landing point nobody was carrying goods to.

The run out of a forwarder's warehouse is priced by exactly the same rules as
any other: Sunyani to a Hwidiem pickup station is a row under Inside Ghana, and
if the customer collects at the warehouse's own station it is free. The table
behind all of this is still called `ArrivalPoint` — every listing, order line and
shipment already points at it, and migrations here are additive by rule.

### Pricing the run inside Ghana

**Base fee + increment, charged per seller.** One seller's goods are one
consignment — one pickup, one van, one handover — so the base fee is charged once
for that seller's whole order, and every item after the first adds only a small
weight-and-volume increment. Ten bottles of spray from one shop are one delivery.
Two shops in the same cart are two deliveries, and two base fees, which is also
the truth.

This replaces a per-line fee multiplied by the quantity, under which a GH₵35
bottle of spray with GH₵10 shipping cost GH₵100 to deliver ten of — for one
parcel, on one van, to one station. No courier prices like that and no buyer
believes it.

A **shipping rule** (`/admin/shipping/rates`) is a scope and a price. The scope
is any combination of *from this point*, *to this station* and *for this
category*, and every part is optional. The price is the base fee and the
increment. The most specific matching rule wins; anything no rule claims is
priced by the platform defaults on the Overview screen.

That is deliberately a list rather than a matrix. A matrix has a cell for every
pair whether or not anybody has an opinion about it, no room for a category, and
it grows as the square of the network.

Rules written under the previous model keep pricing without a backfill: a flat
per-item fee is read as the base fee (and stops multiplying), and a per-kilogram
rate derives the increment from one unit's billable weight — the greater of what
a parcel weighs and what its size says it weighs, L×W×H ÷ 5000 by default.

### Minimum order quantity

A listing sold by the carton says so on the listing (**Minimum order** on the
product form), not in a description nothing enforces. The product page starts
the stepper at the minimum and will not go below it, the cart drops a line rather
than parking it under the minimum, and the order action refuses an order that
asks for fewer — because a quantity that arrived from a browser is a claim.

### Goods from abroad

CBM stays where it belongs — the forwarder's leg — because that is how
forwarders invoice. Two arrangements exist, and the seller picks one on the
listing:

1. **The supplier delivers.** Their price already puts the goods at a Ghana
   consolidation point. Nothing is charged for the international leg and no
   border is billed again; the buyer pays only the local run from that point.
2. **A forwarder carries it.** The supplier reaches a forwarder in their own
   country (the buyer pays that hop), and the forwarder's rate brings it the
   rest of the way.

Forwarders are admin-owned (`/admin/shipping/forwarders`) and registered in one
window, because their profile is one thing and half of it cannot quote. Each
holds their own rate sheet, shaped the way their real one is:

```
FreightForwarder            who they are, where they collect, where their
│                           Ghana address is, the currency they quote in
├── consolidation points    their own warehouses in Ghana. One grid each.
├── goods classes           theirs, not ours — the rows of every grid
│   └── levy in CBM         the special levy, as extra cubic metres
├── category mapping        our categories → their classes, as a grid
└── lanes                   one mode into one warehouse — the columns
    ├── rate per CBM        the cell, or blank for "we don't carry that"
    ├── delivery estimate   per mode, because sea and air are not the same
    ├── minimum CBM         what they will not ship under
    └── order frequency     when purchases actually go out. Internal.
```

So one grid is "origin → Sunyani": normal goods by sea in one cell, special in
the next, heavy-duty in the third, with an air column beside them and blanks
where that mode will not take that class. Another warehouse is another grid.
Rows and columns are added as you go, and a blank cell is a real answer — the
listing form refuses that combination rather than falling through to a price
meant for something else.

Their classes are deliberately not our categories: ours are what a shopper
browses, theirs are what a container is priced by, and no amount of renaming
"Fashion" makes it a thing a shipping line quotes.

**The forwarder's rate is the whole leg.** No platform duty, VAT, clearing fee
or fallback rate is added on top of it — whatever they paid at a port is already
inside the number they quoted, and charging any of it again billed the buyer
twice for one thing. A lane nobody has priced is **refused**, not quoted at
zero.

Deleting a forwarder deletes them: their warehouses, classes, lanes and prices
go too. Deactivating instead was the old behaviour and it was the wrong one —
the code stayed taken and the warehouses stayed in the database.

### Currencies

Freight abroad is quoted in dollars far more often than in cedis, so rates are
stored **as the forwarder quoted them** and converted at pricing time from the
table under `/admin/shipping/currencies`. One exchange rate moves every route
priced in that currency; storing converted cedi figures would mean retyping
every rate on the day the cedi moved.

**The rates fetch themselves.** They used to be numbers somebody typed, which
meant they were right on the day they were typed and silently wrong afterwards —
and the wrongness only ever goes one way, because the cedi does. A cron
(`/api/cron/rates`, 05:00) pulls the day's reference rates and applies them
everywhere at once; the screen says when they last landed, and there is a button
for the days the cedi does not wait for the cron.

Three rules keep an outside service from doing damage: a currency can be
**pinned by hand** and the fetch skips it (that is also what saving a rate on
the form does); a figure that has moved by more than half is **skipped, not
stored**, because real currencies do not do that overnight; and a failed fetch
**changes nothing** — yesterday's rates stand and the screen says the fetch
failed rather than showing them as today's. A currency nobody has priced
converts one-for-one — visibly wrong rather than invisibly zero — and the
Overview says so.

On the forwarder's grid the conversion is shown as you type: the admin enters
what the forwarder quoted and reads back what a buyer pays, which is the only
figure either of them can check.

### Choosing a lane

The **seller** chooses, on the listing, in the order the goods travel: which
forwarder, which of *their* Ghana warehouses, and which of the modes they run
into it. The rate appears as soon as the category and the dimensions are in —
the category decides the forwarder's class, the dimensions decide the cubic
metres, and those two are the whole of their price. The cubic metres are worked
out from L×W×H; a seller never divides by a million.

The seller also enters what the supplier charges to reach the forwarder's
warehouse abroad, so the estimate on the form is the whole journey: to the
forwarder, into Ghana, and on to the buyer's station.

The lane and its promised window are snapshotted onto the order line. There is
no buyer-side choice at checkout: the seller already made it, and offering sea
for one carton and air for the next out of the same warehouse would be selling
something nobody ships.

### Special shipments

Cars, generators, anything fragile or oversized: the seller or admin sets
**a fixed fee** on the listing and nothing is added to it. That is the point of
quoting a car by hand — no rate table gets an opinion about it. **Free
shipping** is the third method, where the seller absorbs the cost.

### What the buyer sees

Two numbers: the item price, and the shipping to the station they chose.

Three legs — to the forwarder abroad, into Ghana, and on to the station — are
all real, all charged, and all **inside that second number**. They are kept
itemised on the order and its lines, because an admin has to be able to answer
"why GH₵240?" and a seller's payout must not be computed off freight they never
charged, but none of it is ever a row on a buyer's screen.

### Paying

The item price is **always paid in full at checkout** — that is money the seller
spends the moment they fulfil the order. Only the **shipping** may wait, and
only when the platform allows it and every seller on the order has ticked *let
buyers pay the shipping when they collect*. The buyer then carries any rate
movement in between, which the checkout says plainly before they choose it. The
order stores the plan, what was paid and what is outstanding.

## Order placement

**`/admin/purchasing`** answers the question nothing answered before: when is it
time to place the international orders?

A customer pays for one pair of shoes. No forwarder will ship one pair of shoes
— they have a minimum consignment, and it is measured from the supplier. So the
line waits, and what it waits for is *other lines going to the same supplier*: a
supplier who sells shoes also sells bags and sandals, and everything bought from
them on one day is packed into one parcel and consolidated once.

One row in the queue is therefore one supplier, on one lane, for one seller —
the parcel that will be shipped. It turns green when its volume clears that
lane's **minimum CBM**, or when the lane's **order frequency** next comes round;
either is a reason to buy, and neither of them is "somebody remembered". The
supplier's link, name and contact are on the row, taken from the listing, so the
admin placing the order goes straight to the item.

Placing an order records a purchase with a reference and attaches the customer
lines it covers, which is what takes them out of the queue. The attachment is
scoped in the same query that writes it, so two admins working the queue at once
cannot buy the same goods twice. Cancelling a purchase releases its lines back.

**Only an admin places an order** — it spends the platform's money with a
supplier abroad. Sellers see the same queue for their own shop at
`/seller/purchasing`, read-only, so they can answer the question their customers
keep asking without being able to buy.

## Shipped from Abroad

The public face of arrangement 2 above, at **`/shipped-from-abroad`**. It
replaces the old preorder system and absorbs the old Global Shopping page: a
preorder was a window that closed, this is dropshipping that never does. A
seller finds an item on Alibaba (or anywhere), copies its details and link, and
lists it; buyers can order at any time and the seller sources it once they do.

The listing's JSON terms hold what the seller *promises* — where it is coming
from, when it should arrive, what happens if it does not. The money lives in
real columns and is priced by the shipping engine, because it has to be queried,
joined and re-priced on the server.

### Tracking and notifications

An imported consignment has two milestones a domestic one does not — *at the
freight forwarder* and *arrived in Ghana* — because otherwise a buyer stares at
"in transit" for six weeks. Sellers are alerted on **both SMS and email** for
every new order regardless of the staff-channel setting; buyers get their own
message when the goods land in Ghana (carrying any shipping now due) and again
when they are ready to collect.

### Where the code lives

| Concern | Module |
| --- | --- |
| The fee engine: weight, rules, forwarder rates, the free-at-origin rule (pure, unit-tested) | `src/lib/shipping.ts` |
| Loading points, forwarders, rules and defaults | `src/lib/shipping-config.ts` |
| Our points, the domestic rules, the defaults, the exchange rates | `src/lib/shipping-admin-actions.ts` |
| A forwarder's whole profile, saved as one thing | `src/lib/forwarder-actions.ts` |
| The order-placement queue and its purchases | `src/lib/purchasing.ts`, `src/lib/purchasing-actions.ts` |
| Fetching the day's exchange rates | `src/lib/fx.ts`, `src/app/api/cron/rates/route.ts` |
| Cart pricing, server-side | `src/lib/cart-pricing.ts` |
| The bill's shape and the payment plans (pure, client-safe) | `src/lib/cart-bill.ts` |
| Checkout's quote | `src/lib/checkout-actions.ts` |
| Terms parse/serialise, the two spellings of the product type | `src/lib/abroad.ts` |

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

It is deliberately its own world, and now literally so: the bundle business runs
on **its own Postgres database** and settles into **its own Paystack account**.
Bundles are not `Product` rows, bundle orders are not `Order` rows, and nothing
about them touches the cart, shipping, pickup points, or seller settlements.
What they still share is the Arkesel sender that texts the buyer, and the
Nickimart account an agent signs in with.

### Two databases

`DATA_DATABASE_URL` is the bundle database: the price ladder, bundle and AFA
orders, the whole agent platform (accounts, prices, ledger, withdrawals,
applications, referrals) and the settings the bundle console reads. `prisma/data/schema.prisma`
describes it and `src/lib/data-db.ts` is the only way into it; `DATABASE_URL`
and `src/lib/prisma.ts` remain the retail mall's.

Why: the two businesses fail, grow and get restored independently. A restore of
one no longer rolls the other back, and a bundle price edit no longer contends
with a Black Friday checkout.

The one thing that crosses is identity. `DataAgent.userId` holds a `User.id`
from the retail database as a plain indexed column — Postgres cannot reference
across databases — so code joins the two sides through
`src/lib/data-bundles/user-link.ts`, once per page of rows rather than once per
row.

**Nothing has to move at once.** With `DATA_DATABASE_URL` unset, both the client
and the migration runner fall back to `DATABASE_URL` and the app behaves exactly
as it did before the split. To separate them:

```bash
# 1. Create the database and set DATA_DATABASE_URL, then deploy.
#    db/data-migrations/*.sql is applied automatically by `npm run build`.
# 2. Copy the existing rows across. Reads DATABASE_URL, writes DATA_DATABASE_URL,
#    and never touches the source.
npm run db:copy-data -- --dry-run   # counts both sides, changes nothing
npm run db:copy-data                # copies; safe to run again
# 3. Check the console, then drop the old tables from the retail database by hand.
```

### Two Paystack accounts

`PAYSTACK_SECRET_KEY` is the **data bundles** account — the bundle storefront,
agent storefronts, AFA registrations and agent registration fees. The mall uses
`RETAIL_PAYSTACK_SECRET_KEY`. Leave the retail key unset and retail falls back to
the first, which is how it worked before the accounts were split; setting it is
what separates the payouts.

Both dashboards point their webhook at the same `/api/paystack/webhook`. It
checks the signature against each configured key to work out which account
signed an event, then refuses to settle a reference that account does not own —
without that, one account's key would be enough to sign an event naming an order
in the other's ledger and have it settled unpaid.

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

`/admin/data` is the **Data Bundles** console — one of the admin's two consoles,
behind the same `requireAdmin` guard:

- **Overview** — agent wallet balance, today's takings, in-flight and failed
  orders, revenue against provider cost, and a setup checklist.
- **Bundle prices** — the price table per network. Record the provider's cost
  beside each size and the margin is worked out as you type; "Price from cost"
  re-prices a whole network at a markup in one move. The **Team** column is what
  a selling agent's recruiter earns on that bundle, and it refuses an amount
  larger than your own margin on the agent price.
- **Bundle orders** — filter by status, search by reference or phone, and per
  order: send now, refresh from the provider, mark refunded.
- **AFA** — registrations and their approval status.
- **Agents** — the roster, the application queue, and per agent their wallet,
  ledger, orders and who recruited them.
- **Referrals** — every number the referral programme pays on (see below),
  registration waivers, and what those numbers have actually paid out.
- **Leaderboard** — the boards as agents see them, the points a place pays, the
  rewards points buy, and the queue of claims waiting to be handed over.
- **Withdrawals / Announcements / Agent support** — the MoMo payout queue,
  broadcasts to agents, and their callback requests.
- **Store settings** — store name, tagline, open/closed, support WhatsApp, the
  AFA fee, the default markup, the registration fee and how it is collected.

Prices ship seeded with a **placeholder** ladder so the store is never empty.
Check every row against your agent cost in **Admin → Data → Bundle prices**
before advertising the store.

### Referrals and team earnings

An agent's own agent code (`NKM4821`) **is** their referral code — there is no
second identifier to lose. Applicants can quote one when they apply, or arrive
on an invite link (`/become-an-agent?ref=NKM4821`) that prefills it; approval
records the relationship on the new account, permanently.

Two levels, and only two. With `A → B → C`:

| Event | A earns | B earns |
| --- | --- | --- |
| B registers | direct reward | — |
| C registers | second-level reward | direct reward |
| D registers (recruited by C) | **nothing** | second-level reward |
| B makes a qualifying sale | team commission | — |
| C makes a qualifying sale | **nothing** | team commission |

Recruitment rewards reach two levels up; **sales commission reaches one.**

**Nothing is paid on a promise.** A joining reward is released only once the new
agent's registration fee has actually been paid — up front through Paystack, or
by clearing out of their commission. A registration **nobody paid for pays
nobody**: that is what makes an invented agent cost more than they are worth,
and it is the rule the rest of the abuse story rests on. The single exception is
a referral waived in full, and only when an admin switches that on.

Everything lands in the existing agent balance and `DataAgentLedger` — there is
no second wallet. Each row carries its commission type, the agent whose activity
produced it, the referral level, and the order or agent code behind it, so a
credit traces back to its source instead of being a line of narration.

Agents see all of it under **My Team** (`/agent/team`): their code and invite
link, both levels of recruits with whether each one's registration fee has been
paid, active recruits, team sales, and the three earnings totals.

Admins set every value in **Admin → Data Bundles → Referrals**: the two joining
rewards, whether the second level pays at all, the default team-sales
commission, what counts as a qualifying sale (minimum sale amount, minimum
commission to the seller, whether AFA counts), a daily cap on rewards per agent,
the registration waivers below, and the programme switch. Per-bundle team commissions live on the Bundle prices
tab, next to the margin they come out of. Every calculation reads the current
values at the moment it runs, so a change takes effect on the next sale with no
deploy — and amounts already earned are snapshotted on the order or in the
ledger, so a change never rewrites what somebody was already owed.

**What it refuses**, each on its own terms: self-referral (same agent, same
Nickimart account, same email, or same phone number); a second referrer, or a
referrer changed after activation; a cycle between two agents; commission on a
failed, cancelled or refunded sale; and — by a unique index on the ledger rather
than by a code path — paying the same commission twice, however many retries,
sweeps and webhooks reach it.

### The registration fee, and who pays which part of it

What it costs to open a storefront, and how that cost is collected, are both
the admin's. **Store settings** carries the fee and one of three ways to
collect it:

- **Up front only** — the new agent pays before trading. Their storefront stays
  closed to customers until the payment clears, which is what paying to
  register has to mean if it is to mean anything.
- **From commission only** — the fee is debited on approval and clears itself
  out of what they earn. Nothing to pay before they start.
- **Either** — the applicant picks one when they apply.

A referral can bring that fee down. Each agent has a **waiver** their own
recruits get — set per agent on their page under **Agents**, falling back to
the programme default under **Referrals** — and of whatever the new agent still
pays, a configurable share is credited to the recruiter once the payment
clears. On a GH₵50 fee with a 40% waiver and a 50% referrer share:

| | |
| --- | --- |
| Registration fee | GH₵50 |
| Referral waiver (40%) | −GH₵20 |
| **New agent pays** | **GH₵30** |
| Credited to the recruiter | GH₵15 |
| Nickimart keeps | GH₵15 |

A 100% waiver means the new agent pays nothing, and there is then nothing to
share — whether that registration still pays the recruiter their *joining
reward* is a separate switch, off by default.

The whole breakdown is recorded on the agent: the fee at full price, the
percentage waived, what the waiver was worth, what they owe, and the share owed
to their recruiter. It is written when the account is created and never
recomputed, so changing a setting tomorrow cannot rewrite a registration from
last month, and **Admin → Data Bundles → Agents → *agent*** shows it line by
line alongside how much has actually been paid. The recruiter's share lands in
the ordinary ledger as `REFERRAL_FEE_SHARE`, keyed on the recruit so it is paid
exactly once.

### Leaderboard, points and rewards

Sell, rank, earn points, redeem — off by default, and one switch turns the
whole thing on. Three boards, each of which an admin can show or hide:

- **Top Sales** — successful sales, meaning orders that were paid for and
  actually delivered.
- **Top Recruiters** — recruits whose registration is settled. A name in the
  queue that never paid is not a recruit.
- **Current Performance** — sales inside a rolling window rather than lifetime
  totals, so a newer agent can compete with an established one. An agent has to
  have been trading a configurable number of days and made a configurable
  number of sales in the window before they appear on it, or an account that
  opened yesterday tops it on its first afternoon.

**Nothing is stored.** Every board is counted out of the orders and referrals
that already exist, so a place can never drift from the sales behind it and a
refunded order simply stops counting. Agents see the top three plus their own
neighbours on their dashboard — an agent in 40th place is shown the two people
they are actually racing — and the full boards at `/agent/leaderboard`.

Points are paid when a **ranking period** closes (weekly, monthly, or all-time,
which never closes and so pays no places): a configurable amount for first,
second and third on every board that is switched on, plus a bonus for an
excellent or exceptional recent performance, because an agent can have their
best month ever and still come fourth. Awards run from the same daily sweep as
everything else and carry a dedupe key built from the board, the period and the
agent, so a sweep that runs a hundred times pays once.

Points buy **rewards** the admin sets up — cash, credited to the agent's
balance on approval, or a data bundle sent to a number the agent gives. What
each costs, what it pays, and whether it is on the shelf at all are all
configurable, and none of it is in the code. Points leave the agent the moment
a reward is claimed, exactly as cedis do on a withdrawal, so the same points
cannot buy two rewards while the queue is being worked through; turning a claim
down refunds them.

### Setup

1. Run `nikimart-neon-data-bundles.sql` on the database (tables + seed ladder +
   settings). It's idempotent and never overwrites prices you've already set.
   On a database that already has the bundle tables, `db/data-migrations/` is
   applied by `npm run build` and brings them up to date.
2. Generate an API key at justicedatashop.com → Developer → Authentication and
   set `JUSTICE_API_KEY`.
3. Set `JUSTICE_AGENT_PHONE` and `JUSTICE_AGENT_PASSWORD` to the login for that
   same Justice Datashop agent dashboard. The API key can order but cannot read
   a price list, so the nightly cost sync signs in with these and reads the
   account's own package tier. It only ever writes `DataBundle.costPrice` —
   retail prices, agent prices and what is on sale are left alone. Leave them
   unset and costs stay whatever an admin last typed; **Fetch now** on Bundle
   prices says so rather than failing quietly. Sign-in cannot be automated if
   the provider dashboard has one-time codes switched on for this account.
4. Point Paystack's webhook at `https://<your-domain>/api/paystack/webhook`
   (Paystack dashboard → Settings → API Keys & Webhooks). It settles orders
   where the buyer closed the browser before the redirect finished, and serves
   the mall and the bundle store alike.
5. Keep the agent wallet funded — every bundle you sell is bought from it. A
   daily sweep (`/api/cron/data-bundles`, in `vercel.json`) texts admins when it
   drops below the threshold in Store settings, re-drives orders that were paid
   but never reached the provider, and re-checks ones the provider never
   confirmed, and refreshes the cost prices above. **Run checks now** on the
   overview does the same on demand. Raise
   it to hourly (`0 * * * *`) on a Vercel plan above Hobby, which refuses to
   deploy crons that run more than once a day.

Without `JUSTICE_API_KEY` the storefront still takes orders; they queue as paid
and undispatched until the key is added and you press **Send now**.

## Data model

Two Prisma schemas, one per database. Both datasources are PostgreSQL in every
environment.

**`prisma/schema.prisma`** (`DATABASE_URL`) — the retail mall: the Auth.js
tables plus `Category`, `Vendor`, `Product`, `Order`, `OrderItem`,
`PickupPoint`, `Shipment`, and the page builder (`Page`, `PageSection`,
`SiteSetting`).

**`prisma/data/schema.prisma`** (`DATA_DATABASE_URL`, falling back to
`DATABASE_URL`) — the bundle business: `DataBundle`, `DataOrder`,
`AfaRegistration`, `DataAgent` and its `DataAgentPrice` / `DataAgentLedger` /
`DataAgentWithdrawal` / `DataAgentApplication`, `DataAnnouncement`,
`DataSupportRequest`, and `DataSetting`. It generates a second client to
`node_modules/.prisma/data-client`, reached only through `src/lib/data-db.ts`.

`npm run prisma:generate` generates both; `npm run build` and `postinstall` call
it, so there is nothing extra to remember.

## Useful scripts

| Script            | Description                          |
| ----------------- | ------------------------------------ |
| `npm run dev`     | Start the dev server                 |
| `npm run build`   | Production build                     |
| `npm run lint`    | Run ESLint                           |
| `npm test`        | Run the unit tests (Node test runner)|
| `npm run prisma:generate` | Generate both Prisma clients (retail + data bundles) |
| `npm run db:migrate:deploy` | Apply `db/migrations` and `db/data-migrations` |
| `npm run db:copy-data` | One-time copy of the bundle tables into `DATA_DATABASE_URL` (`-- --dry-run` to count only) |
| `npm run db:migrate` | Create/apply Prisma migrations    |
| `npm run db:seed` | Seed demo data                       |
| `npm run db:reset`| Drop, re-migrate, and re-seed the DB |
