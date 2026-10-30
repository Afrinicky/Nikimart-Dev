#!/usr/bin/env node
/**
 * Copy the logins the bundle business needs out of the retail database.
 *
 * The last thing still crossing the line between the two databases was
 * identity. An agent signed in with a Nickimart mall account, so every agent
 * console page needed the retail database to be up; when the retail Neon
 * project ran out of compute in October, no agent could sign in, while every
 * bundle, order and storefront in the bundle database stayed perfectly
 * healthy. This is the one-time copy that ends that.
 *
 *     DATABASE_URL=…retail… DATA_DATABASE_URL=…bundles… \
 *       node scripts/copy-logins.mjs --dry-run   # count, change nothing
 *       node scripts/copy-logins.mjs             # insert the missing ones
 *       node scripts/copy-logins.mjs --refresh   # also re-copy unchanged rows
 *
 * Who is copied: everybody holding a `DataAgent` row — that list comes from
 * the bundle database, which does not need retail to be reachable — and every
 * retail `User` whose role is ADMIN, because the bundle console is theirs to
 * run and locking them out of it during a retail outage is the same bug.
 *
 * What is copied: name, email, phone, image, the bcrypt hash verbatim, the
 * two-factor flags and `mustChangePassword`. Bcrypt strings carry their own
 * cost and salt, so a hash means the same thing in either database and the
 * password somebody already knows keeps working. Nobody is reset.
 *
 * `id` is kept. `DataAgent.userId`, `DataOrder.userId` and the ledger hold
 * retail `User.id` values as plain columns, so keeping the ids is the whole
 * reason this is a copy and not a rebuild: every reference goes on resolving.
 *
 * It never writes to retail. Retail keeps its own users and its own logins,
 * and somebody who is both an agent and a mall customer ends up with two
 * accounts that start identical and are then free to diverge — which is what
 * being a separate business means.
 *
 * Safe to run twice. An account already here is left alone, because after the
 * cutover it may have a password of its own that retail has never heard of.
 * `--refresh` re-copies only the rows whose `passwordChangedAt` is still null,
 * i.e. the ones that have not yet been touched on this side.
 */

import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const DRY_RUN = process.argv.includes("--dry-run");
const REFRESH = process.argv.includes("--refresh");

const log = (msg) => process.stdout.write(`[copy-logins] ${msg}\n`);

function fail(msg, err) {
  process.stderr.write(`\n[copy-logins] ${msg}\n`);
  if (err) process.stderr.write(`${err instanceof Error ? err.message : String(err)}\n`);
  process.exit(1);
}

const RETAIL_URL = process.env.DATABASE_URL;
const DATA_URL = process.env.DATA_DATABASE_URL;

if (!RETAIL_URL) fail("DATABASE_URL is not set — nothing to copy from.");
if (!DATA_URL) fail("DATA_DATABASE_URL is not set — nothing to copy to.");
if (RETAIL_URL.trim() === DATA_URL.trim()) {
  fail(
    "DATABASE_URL and DATA_DATABASE_URL are the same database.\n" +
      "The bundle tables have not been split out yet, so there is nowhere separate\n" +
      "to copy logins to and nothing for this to protect against.",
  );
}

const { PrismaClient: RetailClient } = await import("@prisma/client");
// The data client is generated to its own directory rather than the default
// one, and that path is a bundler specifier the app resolves — Node's own ESM
// loader will not take it as a package name, so it is imported by file URL.
const dataClientPath = pathToFileURL(
  path.join(ROOT, "node_modules", ".prisma", "data-client", "index.js"),
).href;
const { PrismaClient: DataClient } = await import(dataClientPath);

const retail = new RetailClient({ datasourceUrl: RETAIL_URL, log: ["error"] });
const data = new DataClient({ datasourceUrl: DATA_URL, log: ["error"] });

try {
  // The agent roster is read from the bundle database on purpose: it is the
  // side that stays up, and it is the side that decides who an agent is.
  const agents = await data.dataAgent.findMany({ select: { userId: true } });
  const agentIds = [...new Set(agents.map((a) => a.userId).filter(Boolean))];
  log(`${agentIds.length} agent accounts in the bundle database`);

  // Admins are read from retail, because ADMIN is a retail role and there is
  // nowhere else it is written down yet.
  const admins = await retail.user.findMany({
    where: { role: "ADMIN" },
    select: { id: true },
  });
  const adminIds = admins.map((a) => a.id);
  log(`${adminIds.length} admin accounts in the retail database`);

  const wanted = [...new Set([...agentIds, ...adminIds])];
  const adminSet = new Set(adminIds);

  const users = await retail.user.findMany({
    where: { id: { in: wanted } },
    select: {
      id: true,
      name: true,
      email: true,
      phone: true,
      image: true,
      passwordHash: true,
      mustChangePassword: true,
      twoFactorEnabled: true,
      twoFactorChannel: true,
    },
  });
  log(`${users.length} of those ${wanted.length} accounts exist in retail`);

  // An agent whose retail account has been deleted. The agent row, its store
  // and its ledger are all still here; there is simply no longer a person to
  // sign in as. Worth naming rather than silently copying 0 rows for.
  const orphans = wanted.filter((id) => !users.some((u) => u.id === id));
  if (orphans.length) {
    const names = orphans.slice(0, 5).join(", ") + (orphans.length > 5 ? " …" : "");
    log(`${orphans.length} ${orphans.length === 1 ? "has" : "have"} no retail account any more: ${names}`);
  }

  const noPassword = users.filter((u) => !u.passwordHash).length;
  if (noPassword) {
    log(`${noPassword} ${noPassword === 1 ? "has" : "have"} never had a password and cannot sign in yet`);
  }

  const existing = await data.dataUser.findMany({
    select: { id: true, passwordChangedAt: true },
  });
  const here = new Map(existing.map((r) => [r.id, r]));

  const toInsert = users.filter((u) => !here.has(u.id));
  const toRefresh = REFRESH
    ? users.filter((u) => here.has(u.id) && here.get(u.id).passwordChangedAt === null)
    : [];
  const leftAlone = users.length - toInsert.length - toRefresh.length;

  log(`${toInsert.length} to insert, ${toRefresh.length} to refresh, ${leftAlone} left alone`);

  if (DRY_RUN) {
    log("--dry-run: nothing was written.");
    process.exit(0);
  }

  const now = new Date();
  const row = (u) => ({
    id: u.id,
    name: u.name,
    email: u.email,
    phone: u.phone,
    image: u.image,
    passwordHash: u.passwordHash,
    role: adminSet.has(u.id) ? "ADMIN" : "AGENT",
    mustChangePassword: u.mustChangePassword,
    twoFactorEnabled: u.twoFactorEnabled,
    twoFactorChannel: u.twoFactorChannel,
    copiedAt: now,
  });

  let inserted = 0;
  for (const u of toInsert) {
    try {
      await data.dataUser.create({ data: row(u) });
      inserted++;
    } catch (err) {
      // One bad row must not cost the other four hundred. The likeliest cause
      // is two retail accounts sharing an email after a manual edit, which is
      // a support question rather than a reason to stop.
      process.stderr.write(`[copy-logins] could not copy ${u.id} (${u.email}): ${err.message.split("\n")[0]}\n`);
    }
  }

  let refreshed = 0;
  for (const u of toRefresh) {
    const { id, copiedAt, ...fields } = row(u);
    try {
      await data.dataUser.update({ where: { id }, data: { ...fields, copiedAt } });
      refreshed++;
    } catch (err) {
      process.stderr.write(`[copy-logins] could not refresh ${u.id}: ${err.message.split("\n")[0]}\n`);
    }
  }

  const total = await data.dataUser.count();
  log(`inserted ${inserted}, refreshed ${refreshed}. ${total} logins now in the bundle database.`);
  log("Retail was not modified.");
} catch (err) {
  fail("the copy failed.", err);
} finally {
  await retail.$disconnect().catch(() => {});
  await data.$disconnect().catch(() => {});
}
