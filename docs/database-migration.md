# Moving a Nickimart database to a new Neon project

Written when `nikimart-retail` used up its monthly compute allowance, the Neon
compute was suspended, and the site spent an evening serving an empty
catalogue out of cache while nobody could sign in.

It covers two jobs that are the same job:

- moving a database to a fresh Neon project, and
- splitting a business onto a project of its own, so that one running out of
  compute cannot take the other two down with it.

## The job in front of us: retail only

Only `DATABASE_URL` moves. `DATA_DATABASE_URL` and `MEDICAL_DATABASE_URL` are
left exactly as they are, and the bundle and medical businesses carry on
against whatever database they are already using. Splitting those two onto
projects of their own is a later piece of work, and the section at the bottom
is what it will need.

One thing to establish on the day, before anything else:

```sh
psql "$OLD_RETAIL" -tAc "SELECT to_regclass('public.\"DataAgent\"')"
```

If that answers with a table name, the bundle tables are living *inside* the
retail database — `DATA_DATABASE_URL` is unset, and `src/lib/data-db.ts` has
been falling back to `DATABASE_URL` all along. They will then travel to the
new project along with everything else, which is what has to happen anyway:
the old project is the one that ran out of compute. Say so in the handover
rather than reporting that the bundle database was left untouched.

If it answers empty, the bundle business is already on a project of its own
and this move genuinely does not touch it.

The procedure is the same either way. Nothing below needs to change.

## Before you start

**The source has to be awake.** A suspended Neon compute refuses connections,
so there is nothing to dump. If the project is over its allowance, either
upgrade the plan or wait for the billing period to roll over. Nothing below
works until `psql "$SOURCE" -c 'select 1'` answers.

**`pg_dump` must be at least the source's major version.** Check with
`pg_dump --version` against `SHOW server_version`. The clone script checks
this first and stops with the package name to install; it is a sentence to fix
now and an outage to discover halfway through a maintenance window.

**Create the destination empty.** A new Neon project, same Postgres major
version or newer. Do not let a deploy build against it first — the schema
arrives with the dump.

## The move

Everything written to the old database after the dump is lost, so the window
between the dump and the switch is a window in which the site must not take
orders. Keep it short and do it when the shop is quiet.

1. **Stop the writes.** Put the site in maintenance, or accept that anything
   placed in the next few minutes is gone. Paystack webhooks are the ones that
   bite: a payment confirmed during the window writes to the database you are
   about to abandon. Pause the cron jobs in `vercel.json` too.

2. **Clone.** From a machine with `pg_dump` and `psql`:

   ```sh
   SOURCE_DATABASE_URL='postgresql://…old…' \
   TARGET_DATABASE_URL='postgresql://…new…' \
     node scripts/clone-database.mjs --dry-run   # looks, copies nothing
   ```

   Then drop `--dry-run`. It dumps schema and data with `--no-owner --no-acl`
   (every Neon project has its own owner role), restores in a single
   transaction that stops at the first error, deletes the dump file, and then
   compares a row count per table on both sides. It exits non-zero if anything
   disagrees. **It never writes to the source**, so a bad copy costs you the
   destination and nothing else.

   The connection strings are passed as environment variables rather than
   arguments, but `pg_dump` still receives the URL as an argument and it is
   briefly visible in `ps` — worth knowing on a shared machine.

3. **Check what the script cannot.** Row counts catch a table that failed to
   copy; they do not catch a table that copied wrong. Spot-check the things
   you would notice:

   ```sh
   psql "$TARGET" -c 'SELECT count(*) FROM "User" WHERE "role" = '"'"'ADMIN'"'"''
   psql "$TARGET" -c 'SELECT max("createdAt") FROM "Order"'
   psql "$TARGET" -c 'SELECT count(*) FROM "_NikiMigration"'
   ```

   `_NikiMigration` and `_prisma_migrations` come across with everything else.
   That matters: the next build runs `scripts/migrate.mjs`, which reads those
   tables to decide what to apply. Carrying them means it finds the schema
   already up to date instead of trying to create it a second time.

4. **Switch the environment variable** in Vercel — `DATABASE_URL`,
   `DATA_DATABASE_URL` or `MEDICAL_DATABASE_URL`, whichever you moved — and
   redeploy. Change it on Production, Preview and Development, or a preview
   build will quietly keep using the old database.

5. **Watch the first deploy's build log.** `[migrate] retail: …` lines mean
   the migration bookkeeping did not come across and it is re-applying the
   schema. Stop and look before letting that deploy ship.

6. **Keep the old project for a week.** It costs nothing while suspended and
   it is the only rollback you have: put the old URL back and redeploy.

## Splitting a business onto its own project

`src/lib/data-db.ts` and `src/lib/medical/db.ts` already expect this. Each
reads its own URL, and the data-bundle client falls back to `DATABASE_URL`
when `DATA_DATABASE_URL` is unset, so the split is one environment variable
plus a copy — not a deploy that has to land everywhere at once.

For a business whose tables are *already* in the retail database there was
`scripts/copy-data-db.mjs`, which copies the data-bundle tables only, in
dependency order. **It currently refuses to run, and it is right to.** Its
table list was written when the bundle schema had 11 tables; the schema now
has 35. A table missing from that list is not copied and nothing complains —
so the script would have reported a clean copy while leaving behind every
messenger conversation, every reward redemption, every agent point and wallet
top-up, each agent's referral and waiver figures, and every application's
password.

`node scripts/copy-data-db.mjs --check` reports the drift and copies nothing.
Before the split, either bring that list back in line with
`prisma/data/schema.prisma` — and check the columns too, five of the eleven
listed tables are also missing columns — or take the safer route and invert
the problem: clone the whole retail database into the new project with
`scripts/clone-database.mjs`, then drop the tables that do not belong there.
A table you forget to drop is a harmless duplicate; a table you forget to copy
is gone.

Either way the old tables are still sitting in the retail database afterwards.
Dropping them is a separate decision, made once you are satisfied the new
project is the one being read.

## Why this keeps happening

The Neon Free plan gives **100 compute-hours per project per month**, and a
compute that is awake at the smallest size burns 0.25 of those per hour — so
roughly 400 hours of being awake, out of the ~730 in a month. Moving to a new
project buys a fresh 100 hours; it does not change how fast they are spent.

What spends them is the database being *awake*, not the number of queries.
`export const revalidate = 60` in `src/app/layout.tsx` applies to the whole
route tree, so any trickle of traffic re-queries at least once a minute and
the compute never gets the idle stretch it needs to scale to zero.

If the move has to be repeated next month, the lever is one of:

- raise `revalidate` on the marketing pages so there are gaps long enough to
  sleep through,
- split the three businesses onto three projects, each with its own 100 hours
  and each awake only when that business is being used, or
- move off the Free plan, where none of this is a constraint.
