#!/usr/bin/env node
/**
 * Apply the SQL in db/migrations, once each, before the app is built.
 *
 * The problem this solves: a deploy would ship code that selected a column the
 * database did not have yet, because applying the SQL was a separate manual
 * step somebody had to remember. Prisma selects every scalar on a model, so
 * one missing column takes down every page that reads that table — the admin
 * console and registration both went down this way. Shipping the schema with
 * the code removes the window entirely.
 *
 * Deliberate choices:
 *
 *   - No DATABASE_URL is not an error. A local `next build` with no database,
 *     or a CI lint job, should not fail for want of one.
 *   - A failing migration IS an error. The build stops and the deploy does not
 *     ship: code that needs a schema it could not get would only fail later,
 *     in front of customers, instead of here.
 *   - An advisory lock, because two deploys can build at once and both would
 *     otherwise try to create the same table.
 *   - Checksums are recorded and checked. Editing a file after it has been
 *     applied means some databases have one version and some another; that is
 *     worth a loud warning even though it is too late to undo.
 */

import { createHash } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DIR = path.join(ROOT, "db", "migrations");

/** Postgres advisory lock id — any constant, shared by every deploy. */
const LOCK_ID = 4711_2026;

const log = (msg) => process.stdout.write(`[migrate] ${msg}\n`);

function fail(msg, err) {
  process.stderr.write(`\n[migrate] ${msg}\n`);
  if (err) process.stderr.write(`${err instanceof Error ? err.message : String(err)}\n`);
  process.exit(1);
}

if (!process.env.DATABASE_URL) {
  log("DATABASE_URL is not set — skipping. (Fine locally; on a deploy, check the environment.)");
  process.exit(0);
}

let files;
try {
  files = readdirSync(DIR).filter((f) => f.endsWith(".sql")).sort();
} catch {
  log("no db/migrations directory — nothing to apply.");
  process.exit(0);
}

if (files.length === 0) {
  log("no migrations to apply.");
  process.exit(0);
}

// Imported lazily so a missing client can't crash the "skip" paths above.
const { PrismaClient } = await import("@prisma/client");
const prisma = new PrismaClient();

/**
 * Run one file through the Prisma CLI rather than the client: the client sends
 * statements as prepared queries, and Postgres refuses more than one command
 * per prepared query, so a multi-statement migration would fail on statement
 * two. `db execute` sends the file as a single script, which is what a
 * migration is.
 */
function execFile(file) {
  const result = spawnSync(
    process.execPath,
    [path.join(ROOT, "node_modules", "prisma", "build", "index.js"), "db", "execute",
     "--url", process.env.DATABASE_URL, "--file", path.join(DIR, file)],
    { cwd: ROOT, encoding: "utf8" },
  );
  if (result.status !== 0) {
    throw new Error(`${result.stderr || result.stdout || "prisma db execute failed"}`.trim());
  }
}

let locked = false;
try {
  // The lock comes first, before any DDL at all. `CREATE TABLE IF NOT EXISTS`
  // is not race-free: two builds that check at the same moment both decide the
  // table is missing and the loser gets a duplicate-key error out of the system
  // catalog. Taking an advisory lock needs no table of our own, so it is the
  // one thing that can safely go first.
  await prisma.$executeRawUnsafe(`SELECT pg_advisory_lock(${LOCK_ID})`);
  locked = true;

  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "_NikiMigration" (
      "name"      TEXT         NOT NULL PRIMARY KEY,
      "checksum"  TEXT         NOT NULL,
      "appliedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `);

  const applied = new Map(
    (await prisma.$queryRawUnsafe(`SELECT "name", "checksum" FROM "_NikiMigration"`))
      .map((r) => [r.name, r.checksum]),
  );

  let ran = 0;
  for (const file of files) {
    const sql = readFileSync(path.join(DIR, file), "utf8");
    const checksum = createHash("sha256").update(sql).digest("hex").slice(0, 16);
    const seen = applied.get(file);

    if (seen) {
      if (seen !== checksum) {
        log(`WARNING: ${file} has changed since it was applied here.`);
        log("         Other databases were migrated with the old text. Add a new");
        log("         migration instead of editing one that has already run.");
      }
      continue;
    }

    log(`applying ${file}`);
    execFile(file);
    await prisma.$executeRawUnsafe(
      `INSERT INTO "_NikiMigration" ("name","checksum") VALUES ($1,$2)
       ON CONFLICT ("name") DO UPDATE SET "checksum" = EXCLUDED."checksum"`,
      file,
      checksum,
    );
    ran++;
  }

  log(ran === 0 ? `database is up to date (${files.length} migrations).` : `applied ${ran}.`);
} catch (err) {
  fail("migration failed — the build is stopping so a broken deploy can't ship.", err);
} finally {
  try {
    if (locked) await prisma.$executeRawUnsafe(`SELECT pg_advisory_unlock(${LOCK_ID})`);
  } catch {
    // The connection is going away anyway; Postgres drops the lock with it.
  }
  await prisma.$disconnect().catch(() => {});
}
