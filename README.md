# NikiMart

NikiMart is an online shopping mall connecting buyers to local shops, preorder
sellers, campus vendors, food vendors, service providers, and official NikiMart
products across Ghana.

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

| Dashboard  | Allowed roles          |
| ---------- | ---------------------- |
| `/account` | all signed-in users    |
| `/seller`  | Seller, Admin          |
| `/admin`   | Admin                  |
| `/freight` | Freight, Admin         |
| `/pickup`  | Pickup, Admin          |

## Data model

Prisma schema (`prisma/schema.prisma`) covers the Auth.js tables plus the
application domain: `Category`, `Vendor`, `Product`, `Order`, `OrderItem`,
`PickupPoint`, and `Shipment`. The datasource is PostgreSQL in every
environment; set `DATABASE_URL` accordingly.

## Useful scripts

| Script            | Description                          |
| ----------------- | ------------------------------------ |
| `npm run dev`     | Start the dev server                 |
| `npm run build`   | Production build                     |
| `npm run lint`    | Run ESLint                           |
| `npm run db:migrate` | Create/apply Prisma migrations    |
| `npm run db:seed` | Seed demo data                       |
| `npm run db:reset`| Drop, re-migrate, and re-seed the DB |
