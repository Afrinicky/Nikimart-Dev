import "server-only";
import { Prisma } from ".prisma/data-client";
import { isDataDatabaseSeparate } from "@/lib/data-db";
import { isExcludedFromBackup } from "@/lib/data-bundles/backup-format";

/**
 * Which tables in the connected database belong to the Data Bundles business.
 *
 * This exists because of the one arrangement where "every table in the public
 * schema" is the wrong answer. `DATA_DATABASE_URL` is optional: when it is not
 * set, `dataDb` falls back to `DATABASE_URL` and points at the retail mall's
 * database, where the bundle tables sit alongside users, products and orders
 * (see src/lib/data-db.ts). Backing up "everything in public" there would
 * sweep the entire mall — customer records and password hashes included — into
 * a file labelled as a bundle backup and ship it to the backup bucket. The
 * brief for this feature says the opposite in as many words, and so did the
 * console's own warning text.
 *
 * So the scope depends on the environment:
 *
 *   split     — the database is the bundle business and nothing else, so every
 *               table is in, including ones added by hand or by a migration
 *               that Prisma does not know about. Discovery stays catalog-driven
 *               and nothing new can be missed.
 *
 *   not split — only the tables this schema declares. The list comes from the
 *               generated client's own model list rather than from a constant
 *               kept by hand, so adding a model to prisma/data/schema.prisma is
 *               still all it takes for the next backup to include it.
 *
 * A table created by raw SQL and never added to the schema is therefore outside
 * an unsplit backup. That is the deliberate trade: in a shared database there
 * is no way to tell such a table from a retail one, and quietly including the
 * mall is far worse than quietly excluding a table nobody declared.
 */

/** Every table the Data Bundles schema declares, from the generated client. */
export function dataBundleTableNames(): Set<string> {
  return new Set(Prisma.dmmf.datamodel.models.map((model) => model.dbName ?? model.name));
}

export interface BackupScope {
  /** True when the whole public schema is the bundle business. */
  whole: boolean;
  /** Whether a table discovered in the catalog is ours to back up or restore. */
  includes(table: string): boolean;
  /** One line for the console and for the backup's own header. */
  reason: string;
}

export function backupScope(): BackupScope {
  if (isDataDatabaseSeparate()) {
    return {
      whole: true,
      includes: (table) => !isExcludedFromBackup(table),
      reason: "every table in the Data Bundles database",
    };
  }

  const declared = dataBundleTableNames();
  return {
    whole: false,
    includes: (table) => declared.has(table) && !isExcludedFromBackup(table),
    reason:
      "only the Data Bundles tables, because this database is shared with the retail mall (DATA_DATABASE_URL is not set)",
  };
}
