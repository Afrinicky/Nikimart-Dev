import { PrismaClient } from "@prisma/client";

// Reuse a single PrismaClient across hot reloads in dev to avoid exhausting
// database connections.
const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

/**
 * On serverless (Vercel) each function instance opens its own Prisma pool.
 * Without a cap, many instances can exhaust the database's connection limit —
 * new queries then block, which surfaces as the UI "freezing". Pin each
 * instance to a small pool with a short wait so it fails fast instead of
 * hanging. Applied only when the URL doesn't already set connection_limit.
 */
function datasourceUrl(): string | undefined {
  const url = process.env.DATABASE_URL;
  if (!url || process.env.NODE_ENV !== "production") return url;
  if (/[?&]connection_limit=/.test(url)) return url;
  const sep = url.includes("?") ? "&" : "?";
  return `${url}${sep}connection_limit=1&pool_timeout=15`;
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
