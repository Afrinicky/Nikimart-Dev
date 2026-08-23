# Database migrations

Every `.sql` file in this directory is applied automatically, in filename
order, at the start of `npm run build` — which is what Vercel runs on deploy.
Each file runs once per database and is recorded in `_NikiMigration`.

This exists because the alternative kept taking production down. A deploy
would land before somebody remembered to paste the SQL into the Neon console,
Prisma would select a column that did not exist yet, and the admin console and
registration would answer every request with "Something went wrong". The code
and the schema ship together now, in that order.

## The rules for a file in here

**Additive.** Add tables, columns, indexes and constraints. Never drop or
rename one. A deploy is not atomic: for a few minutes the old code and the new
schema are both live, so anything the old code still reads has to keep working.
Removing a column is a separate, deliberate exercise, done by hand.

**Idempotent.** `CREATE TABLE IF NOT EXISTS`, `ADD COLUMN IF NOT EXISTS`,
`ON CONFLICT DO NOTHING`. A rerun must be a no-op — a rollback and redeploy
will run these again, as will a restored backup.

**Schema only.** No seed rows, no backfills, no `UPDATE`, no `DELETE`. Those
are judgement calls about somebody's live data and they belong in a script run
deliberately, watched, once. The historical `nikimart-neon-*.sql` files at the
repo root mix the two; that is exactly why they are not run from here.

**Numbered.** `0003_`, `0004_`, … Order is the filename, so a new file always
sorts after the ones it depends on.

## If a migration fails

The build fails, and the deploy does not ship. That is deliberate: a migration
that could not be applied means the code about to go out would not work
anyway, and a red build is a much better outcome than a broken site.

## Running them by hand

    npm run db:migrate:deploy

Same script, same tracking. Useful against a local database, or to apply a
migration to production without waiting for a deploy.

## The files at the repo root

`nikimart-neon-*.sql` are the historical catch-up scripts, kept for setting up
a database from scratch and for reference. They are **not** applied
automatically — several of them seed rows or reset the homepage, which is fine
to do once on purpose and not fine to do on every deploy.
