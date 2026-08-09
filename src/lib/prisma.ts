import { PrismaClient } from "@prisma/client";

// Reuse a single PrismaClient across hot reloads in dev to avoid exhausting
// database connections.
const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

/**
 * On serverless (Vercel) each function instance opens its own Prisma pool
 * against the Neon pooled endpoint. A small per-instance pool keeps many
 * instances from exhausting the database, but it must be large enough for the
 * concurrent queries a single request fires (pages often Promise.all several) —
 * otherwise those queries serialize on one connection and, during a Neon
 * cold start, exceed pool_timeout and throw ("Something went wrong").
 * A modest pool with a cold-start-friendly wait balances both. Applied only
 * when the URL doesn't already set connection_limit.
 */
function datasourceUrl(): string | undefined {
  const url = process.env.DATABASE_URL;
  if (!url || process.env.NODE_ENV !== "production") return url;
  if (/[?&]connection_limit=/.test(url)) return url;
  const sep = url.includes("?") ? "&" : "?";
  return `${url}${sep}connection_limit=5&pool_timeout=20`;
}

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    datasourceUrl: datasourceUrl(),
    log: process.env.NODE_ENV === "development" ? ["error", "warn"] : ["error"],
  });

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
