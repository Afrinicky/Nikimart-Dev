#!/usr/bin/env node
/**
 * Apply the SQL in db/migrations and db/data-migrations, once each, before the
 * app is built — the first against the retail database, the second against the
 * data-bundle one.
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

/**
 * Two databases, two directories.
 *
 * The bundle business runs on its own Postgres instance, so its schema has its
 * own set of files and its own `_NikiMigration` table inside that database.
 * When DATA_DATABASE_URL is not set it falls back to DATABASE_URL — the same
 * fallback the app makes — and the data migrations then apply to the retail
 * database, which is exactly the arrangement they are catching up from.
 *
 * Each target gets its own advisory lock id. Sharing one would make a deploy
 * that touches both wait on itself when the two URLs resolve to the same
 * database, which is the common case before the split.
 */
const TARGETS = [
  {
    name: "retail",
    dir: path.join(ROOT, "db", "migrations"),
    url: process.env.DATABASE_URL,
    lockId: 4711_2026,
  },
  {
    name: "data-bundles",
    dir: path.join(ROOT, "db", "data-migrations"),
    url: process.env.DATA_DATABASE_URL?.trim() || process.env.DATABASE_URL,
    lockId: 4711_2027,
  },
];

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

// Imported lazily so a missing client can't crash the "skip" path above.
const { PrismaClient } = await import("@prisma/client");

/**
 * Run one file through the Prisma CLI rather than the client: the client sends
 * statements as prepared queries, and Postgres refuses more than one command
 * per prepared query, so a multi-statement migration would fail on statement
 * two. `db execute` sends the file as a single script, which is what a
 * migration is.
 */
function execFile(url, dir, file) {
  const result = spawnSync(
    process.execPath,
    [path.join(ROOT, "node_modules", "prisma", "build", "index.js"), "db", "execute",
     "--url", url, "--file", path.join(dir, file)],
    { cwd: ROOT, encoding: "utf8" },
  );
  if (result.status !== 0) {
    throw new Error(`${result.stderr || result.stdout || "prisma db execute failed"}`.trim());
  }
}

async function migrateTarget({ name, dir, url, lockId }) {
  if (!url) {
    log(`${name}: no database URL — skipping.`);
    return;
  }

  let files;
  try {
    files = readdirSync(dir).filter((f) => f.endsWith(".sql")).sort();
  } catch {
    log(`${name}: no ${path.relative(ROOT, dir)} directory — nothing to apply.`);
    return;
  }
  if (files.length === 0) {
    log(`${name}: no migrations to apply.`);
    return;
  }

  const prisma = new PrismaClient({ datasourceUrl: url });
  let locked = false;
  try {
    // The lock comes first, before any DDL at all. `CREATE TABLE IF NOT EXISTS`
    // is not race-free: two builds that check at the same moment both decide the
    // table is missing and the loser gets a duplicate-key error out of the system
    // catalog. Taking an advisory lock needs no table of our own, so it is the
    // one thing that can safely go first.
    await prisma.$executeRawUnsafe(`SELECT pg_advisory_lock(${lockId})`);
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
      const sql = readFileSync(path.join(dir, file), "utf8");
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

      log(`${name}: applying ${file}`);
      execFile(url, dir, file);
      await prisma.$executeRawUnsafe(
        `INSERT INTO "_NikiMigration" ("name","checksum") VALUES ($1,$2)
         ON CONFLICT ("name") DO UPDATE SET "checksum" = EXCLUDED."checksum"`,
        file,
        checksum,
      );
      ran++;
    }

    log(ran === 0 ? `${name}: up to date (${files.length} migrations).` : `${name}: applied ${ran}.`);
  } finally {
    try {
      if (locked) await prisma.$executeRawUnsafe(`SELECT pg_advisory_unlock(${lockId})`);
    } catch {
      // The connection is going away anyway; Postgres drops the lock with it.
    }
    await prisma.$disconnect().catch(() => {});
  }
}

// One target at a time, retail first. The data migrations fall back to the
// retail database when the split hasn't happened yet, and running them in
// parallel against the same database would have two connections taking two
// locks and creating the same table.
try {
  for (const target of TARGETS) {
    await migrateTarget(target);
  }
} catch (err) {
  fail("migration failed — the build is stopping so a broken deploy can't ship.", err);
}
