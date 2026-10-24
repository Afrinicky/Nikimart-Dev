import { PrismaClient } from ".prisma/medical-client";

/**
 * The Prisma client for the medical database.
 *
 * Nickimart runs three businesses out of one repository and three databases:
 * the retail mall (`src/lib/prisma.ts`), the data-bundle platform
 * (`src/lib/data-db.ts`), and this. Nothing outside `src/lib/medical/**` should
 * reach for any of them directly.
 *
 * No fallback, deliberately
 * -------------------------
 * The bundle client falls back to DATABASE_URL when its own variable is unset,
 * because its tables were born in the retail database and the fallback is what
 * let the split happen one variable at a time. Medical has no such history: its
 * tables have never existed in the retail database and must not be created
 * there. So `MEDICAL_DATABASE_URL` or nothing — an unset variable means the
 * medical application is not configured in this environment, which
 * `isMedicalConfigured()` reports and the routes handle, rather than quietly
 * pointing fifty tables' worth of queries at the mall.
 *
 * Identity is the one thing that crosses: `MedicalCustomer.userId`,
 * `MedicalStaff.userId` and `Redistributor.userId` hold a `User.id` from the
 * retail database as plain columns. Use `src/lib/medical/user-link.ts` to join
 * the two sides rather than trying to express it as a relation — Postgres
 * cannot enforce a reference into another database.
 */

const globalForMedicalDb = globalThis as unknown as {
  medicalDb: PrismaClient | undefined;
};

/** True once this environment has been given a medical database. */
export function isMedicalConfigured(): boolean {
  return Boolean(process.env.MEDICAL_DATABASE_URL?.trim());
}

function medicalDatabaseUrl(): string | undefined {
  const url = process.env.MEDICAL_DATABASE_URL?.trim();
  if (!url || process.env.NODE_ENV !== "production") return url;
  // The same small per-instance pool the other two clients use: large enough
  // for the several queries one page fires in parallel, with a wait long enough
  // to survive a Neon cold start.
  if (/[?&]connection_limit=/.test(url)) return url;
  const sep = url.includes("?") ? "&" : "?";
  return `${url}${sep}connection_limit=5&pool_timeout=20`;
}

export const medicalDb =
  globalForMedicalDb.medicalDb ??
  new PrismaClient({
    // An unset URL would throw at construction, and a build with no medical
    // database must still succeed — the same reasoning that keeps every read in
    // this tree falling back to empty rather than throwing. A placeholder is
    // never connected to, because `isMedicalConfigured()` gates the reads.
    datasourceUrl: medicalDatabaseUrl() ?? "postgresql://unconfigured",
    log: process.env.NODE_ENV === "development" ? ["error", "warn"] : ["error"],
  });

if (process.env.NODE_ENV !== "production") {
  globalForMedicalDb.medicalDb = medicalDb;
}

/**
 * Run a read, and return `fallback` if the database is absent or unreachable.
 *
 * Every storefront read goes through this. A medical page on an environment
 * that has no medical database should render its empty state, not a 500 — and
 * a Neon instance that is briefly unreachable should cost a thin page rather
 * than the whole site. Writes never use it: a write that silently did nothing
 * is worse than a write that failed loudly.
 */
export async function readMedical<T>(run: () => Promise<T>, fallback: T): Promise<T> {
  if (!isMedicalConfigured()) return fallback;
  try {
    return await run();
  } catch (error) {
    if (process.env.NODE_ENV !== "production") {
      console.error("[medical] read failed:", error);
    }
    return fallback;
  }
}
