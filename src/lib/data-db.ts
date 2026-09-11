import { PrismaClient } from ".prisma/data-client";

/**
 * The Prisma client for the data-bundle database.
 *
 * The bundle business — its price ladder, its orders, its agents and their
 * ledger — lives on its own Postgres instance, separate from the retail mall.
 * This is the only way into it. `prisma` (src/lib/prisma.ts) is the retail
 * database and knows nothing about bundles; nothing outside
 * lib/data-bundles/** should reach for either one directly.
 *
 * Identity is the one thing that crosses: `DataAgent.userId` holds a `User.id`
 * from the retail database as a plain column. Use lib/data-bundles/user-link.ts
 * to join the two sides rather than trying to express it as a relation.
 */

const globalForDataDb = globalThis as unknown as {
  dataDb: PrismaClient | undefined;
};

/**
 * Which database to talk to.
 *
 * DATA_DATABASE_URL is the separate bundle database. When it is not set we fall
 * back to DATABASE_URL, so an environment that hasn't been split yet keeps
 * working exactly as it did — the tables are still there, and the app cannot
 * tell the difference. Splitting is then one environment variable plus the copy
 * in scripts/copy-data-db.mjs, not a deploy that has to land everywhere at once.
 */
export function dataDatabaseUrl(): string | undefined {
  const url = process.env.DATA_DATABASE_URL?.trim() || process.env.DATABASE_URL;
  if (!url || process.env.NODE_ENV !== "production") return url;
  // Same reasoning as the retail client: a small per-instance pool, big enough
  // for the several queries one page fires in parallel, with a wait long enough
  // to survive a Neon cold start.
  if (/[?&]connection_limit=/.test(url)) return url;
  const sep = url.includes("?") ? "&" : "?";
  return `${url}${sep}connection_limit=5&pool_timeout=20`;
}

/** True once the bundle business is actually on a database of its own. */
export function isDataDatabaseSeparate(): boolean {
  const separate = process.env.DATA_DATABASE_URL?.trim();
  return Boolean(separate && separate !== process.env.DATABASE_URL?.trim());
}

export const dataDb =
  globalForDataDb.dataDb ??
  new PrismaClient({
    datasourceUrl: dataDatabaseUrl(),
    log: process.env.NODE_ENV === "development" ? ["error", "warn"] : ["error"],
  });

if (process.env.NODE_ENV !== "production") {
  globalForDataDb.dataDb = dataDb;
}
