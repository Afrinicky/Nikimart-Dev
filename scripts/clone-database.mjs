#!/usr/bin/env node
/**
 * Copy one Postgres database into another, whole, and prove it arrived.
 *
 * Written for moving a Nickimart database to a fresh Neon project — because
 * the old one ran out of its monthly compute allowance and stopped answering,
 * or because a business is being split onto a project of its own so that an
 * outage in one cannot take the others down with it.
 *
 *     SOURCE_DATABASE_URL=... TARGET_DATABASE_URL=... node scripts/clone-database.mjs
 *     … --dry-run      inspect both ends, copy nothing
 *     … --verify-only  compare row counts on a copy already made
 *     … --force        write into a destination that already has tables
 *
 * Schema and data both, including the `_NikiMigration` table that
 * scripts/migrate.mjs keeps its record in — so the next build sees every
 * migration already applied and does not try to re-run them.
 *
 * It never writes to the source. Nothing here drops, truncates or alters the
 * database it is reading, so a copy that goes wrong costs the destination and
 * nothing else: point the environment back at the original and carry on.
 *
 * Why a script rather than two commands in a runbook: the copy is the easy
 * half. The half worth automating is the part that tells you it worked — a
 * row count per table on both sides, compared, with a non-zero exit when they
 * disagree. A migration you cannot verify is a migration you cannot trust.
 */

import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

const DRY_RUN = process.argv.includes("--dry-run");
const VERIFY_ONLY = process.argv.includes("--verify-only");
const FORCE = process.argv.includes("--force");

const log = (msg) => process.stdout.write(`[clone] ${msg}\n`);

function fail(msg, detail) {
  process.stderr.write(`\n[clone] ${msg}\n`);
  if (detail) process.stderr.write(`${String(detail).trim()}\n`);
  process.exit(1);
}

const SOURCE = process.env.SOURCE_DATABASE_URL?.trim();
const TARGET = process.env.TARGET_DATABASE_URL?.trim();

if (!SOURCE) fail("SOURCE_DATABASE_URL is not set — nothing to copy from.");
if (!TARGET) fail("TARGET_DATABASE_URL is not set — nothing to copy to.");
if (SOURCE === TARGET) fail("Both URLs name the same database. There is nothing to copy.");

/** Hide the password when a URL has to appear in the log. */
function redact(url) {
  try {
    const u = new URL(url);
    if (u.password) u.password = "***";
    return `${u.host}${u.pathname}`;
  } catch {
    return "(unparseable URL)";
  }
}

/** Run a command and hand back its output, or stop with its error. */
function run(cmd, args, { allowFail = false, input } = {}) {
  const out = spawnSync(cmd, args, { encoding: "utf8", input, maxBuffer: 1024 * 1024 * 512 });
  if (out.error) fail(`could not run ${cmd}. Is it installed and on PATH?`, out.error.message);
  if (out.status !== 0 && !allowFail) fail(`${cmd} failed (exit ${out.status}).`, out.stderr);
  return out;
}

/** One value back from a query, as a string. */
function query(url, sql) {
  const out = run("psql", [url, "--no-psqlrc", "--tuples-only", "--no-align", "--command", sql]);
  return out.stdout.trim();
}

/**
 * pg_dump refuses to dump a server newer than itself, and Neon projects are
 * not all on the same major version. Finding that out now is a sentence;
 * finding it out halfway through a maintenance window is an outage.
 */
function checkVersions() {
  const client = run("pg_dump", ["--version"]).stdout.trim();
  const clientMajor = Number(client.match(/(\d+)\./)?.[1] ?? 0);
  const serverMajor = Number(query(SOURCE, "SHOW server_version").match(/^(\d+)/)?.[1] ?? 0);
  log(`pg_dump ${clientMajor}, source server Postgres ${serverMajor}`);
  if (clientMajor < serverMajor) {
    fail(
      `pg_dump is version ${clientMajor} but the source server is Postgres ${serverMajor}.\n` +
        `Install the matching client (postgresql-client-${serverMajor}) and run this again.`,
    );
  }
  const targetMajor = Number(query(TARGET, "SHOW server_version").match(/^(\d+)/)?.[1] ?? 0);
  if (targetMajor < serverMajor) {
    fail(
      `The destination is Postgres ${targetMajor} and the source is ${serverMajor}.\n` +
        `Restoring backwards across a major version is not supported — create the ` +
        `destination project on ${serverMajor} or later.`,
    );
  }
  log(`destination server Postgres ${targetMajor}`);
}

/** Every ordinary table in `public`, in name order. */
function tablesOf(url) {
  const sql =
    "SELECT tablename FROM pg_tables WHERE schemaname = 'public' ORDER BY tablename";
  const out = query(url, sql);
  return out ? out.split("\n").map((t) => t.trim()).filter(Boolean) : [];
}

function rowCount(url, table) {
  const quoted = `"${table.replace(/"/g, '""')}"`;
  return Number(query(url, `SELECT count(*) FROM public.${quoted}`));
}

/**
 * Compare the two sides table by table.
 *
 * Counting rows is a weaker check than comparing them, and a deliberately
 * cheap one: it runs against a database being billed by the second. It
 * catches what actually goes wrong in a restore — a table that failed to
 * copy, one that copied half, one that was never created at all.
 */
function verify() {
  const sourceTables = tablesOf(SOURCE);
  const targetTables = new Set(tablesOf(TARGET));
  if (sourceTables.length === 0) fail("The source has no tables in `public`. Check the URL.");

  const width = Math.max(...sourceTables.map((t) => t.length), 20);
  log(`comparing ${sourceTables.length} tables`);
  process.stdout.write(`\n  ${"table".padEnd(width)}  ${"source".padStart(9)}  ${"target".padStart(9)}\n`);

  const problems = [];
  let rows = 0;
  for (const table of sourceTables) {
    const from = rowCount(SOURCE, table);
    rows += from;
    if (!targetTables.has(table)) {
      problems.push(`${table}: missing from the destination entirely`);
      process.stdout.write(`  ${table.padEnd(width)}  ${String(from).padStart(9)}  ${"absent".padStart(9)}\n`);
      continue;
    }
    const to = rowCount(TARGET, table);
    const mark = from === to ? " " : "  <-- differs";
    if (from !== to) problems.push(`${table}: ${from} rows at the source, ${to} at the destination`);
    process.stdout.write(`  ${table.padEnd(width)}  ${String(from).padStart(9)}  ${String(to).padStart(9)}${mark}\n`);
  }

  const extra = [...targetTables].filter((t) => !sourceTables.includes(t));
  process.stdout.write("\n");
  if (extra.length) log(`the destination also has tables the source does not: ${extra.join(", ")}`);

  if (problems.length) {
    process.stderr.write(`\n[clone] the copy does not match:\n`);
    for (const p of problems) process.stderr.write(`  - ${p}\n`);
    process.stderr.write(
      `\n[clone] Do not switch the application over. The source is untouched.\n`,
    );
    process.exit(1);
  }

  log(`every table matches — ${sourceTables.length} tables, ${rows} rows.`);
}

// ---------------------------------------------------------------------------

log(`source      ${redact(SOURCE)}`);
log(`destination ${redact(TARGET)}`);

if (VERIFY_ONLY) {
  verify();
  process.exit(0);
}

checkVersions();

const existing = tablesOf(TARGET);
if (existing.length > 0 && !FORCE) {
  fail(
    `The destination already has ${existing.length} tables in \`public\`.\n` +
      `Restoring over them would merge two schemas and leave you unable to say which\n` +
      `rows came from where. Empty it first, or pass --force if you know it is a retry\n` +
      `of a restore that failed partway.`,
  );
}

const sourceTables = tablesOf(SOURCE);
if (sourceTables.length === 0) fail("The source has no tables in `public`. Check the URL.");
log(`source holds ${sourceTables.length} tables`);

if (DRY_RUN) {
  log("--dry-run: stopping before the dump. Nothing has been written.");
  process.exit(0);
}

const workDir = mkdtempSync(path.join(tmpdir(), "niki-clone-"));
const dumpFile = path.join(workDir, "dump.sql");

try {
  // --no-owner / --no-acl: every Neon project has its own owner role, and
  // carrying the old one across makes the restore fail on roles that do not
  // exist there. The application connects as whoever the new URL says.
  log("dumping…");
  run("pg_dump", [
    SOURCE,
    "--no-owner",
    "--no-acl",
    "--format=plain",
    "--quote-all-identifiers",
    `--file=${dumpFile}`,
  ]);
  log(`dump written (${(statSync(dumpFile).size / 1024 / 1024).toFixed(1)} MB)`);

  // One transaction, stopping at the first error: a restore that half-worked
  // is the worst outcome available, because it looks like it worked.
  log("restoring…");
  run("psql", [
    TARGET,
    "--no-psqlrc",
    "--quiet",
    "--single-transaction",
    "--set=ON_ERROR_STOP=1",
    `--file=${dumpFile}`,
  ]);
  log("restored");
} finally {
  // The dump is a complete copy of the business, in plain text, in a temp
  // directory. It does not outlive the run that made it.
  rmSync(workDir, { recursive: true, force: true });
}

verify();
log("done. The source has not been modified.");
