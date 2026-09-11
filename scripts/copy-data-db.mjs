#!/usr/bin/env node
/**
 * Copy the data-bundle tables from the retail database into the new one.
 *
 * Run this once, deliberately, when you point DATA_DATABASE_URL at a fresh
 * database. It reads from DATABASE_URL and writes to DATA_DATABASE_URL, in
 * dependency order, and it never touches the source: the old tables are left
 * exactly as they are so you can verify the copy and, if anything is wrong,
 * simply unset DATA_DATABASE_URL and carry on where you were. Dropping them is
 * a separate decision to make by hand, once you are satisfied.
 *
 *     node scripts/copy-data-db.mjs            # copy
 *     node scripts/copy-data-db.mjs --dry-run  # count both sides, change nothing
 *
 * It is safe to run again. Every row is written with its own primary key and
 * `ON CONFLICT DO NOTHING`, so a second run copies whatever the first one
 * missed and leaves everything else alone. It will not overwrite a row that
 * already exists in the destination — if you need that, empty the destination
 * table first and think about why it diverged.
 *
 * Order matters: agents before the orders and ledger rows that reference them,
 * and `referredById` is filled in on a second pass because an agent can be
 * referred by one created after them.
 */

const DRY_RUN = process.argv.includes("--dry-run");

const log = (msg) => process.stdout.write(`[copy-data] ${msg}\n`);

function fail(msg, err) {
  process.stderr.write(`\n[copy-data] ${msg}\n`);
  if (err) process.stderr.write(`${err instanceof Error ? err.message : String(err)}\n`);
  process.exit(1);
}

const SOURCE_URL = process.env.DATABASE_URL;
const DEST_URL = process.env.DATA_DATABASE_URL;

if (!SOURCE_URL) fail("DATABASE_URL is not set — nothing to copy from.");
if (!DEST_URL) fail("DATA_DATABASE_URL is not set — nothing to copy to.");
if (SOURCE_URL.trim() === DEST_URL.trim()) {
  fail(
    "DATABASE_URL and DATA_DATABASE_URL are the same database.\n" +
      "There is nothing to copy: the app is already reading these tables where they are.",
  );
}

/**
 * The tables, in the order they must be written. Columns are listed explicitly
 * rather than `SELECT *` so a column added to one database and not the other
 * fails loudly here instead of copying half a row.
 *
 * `DataAgent.referredById` is deliberately absent from the first pass — it
 * points at another agent, and the one it points at may not be inserted yet.
 * It is filled in afterwards, once every agent exists.
 */
const TABLES = [
  {
    name: "DataBundle",
    columns: ["id", "network", "sizeGb", "price", "costPrice", "agentPrice", "teamCommission",
              "validity", "isActive", "order", "createdAt", "updatedAt"],
  },
  {
    name: "DataAgent",
    columns: ["id", "userId", "code", "slug", "storeName", "storeTagline", "storeAbout",
              "storeOpen", "supportPhone", "supportWhatsapp", "whatsappGroup", "afaPrice",
              "afaEnabled", "status", "balance", "setupFee", "setupFeeMethod", "setupFeePaidAt",
              "setupFeeReference", "referralLockedAt", "createdAt", "updatedAt"],
  },
  {
    name: "DataOrder",
    columns: ["id", "reference", "network", "sizeGb", "price", "costPrice", "recipientPhone",
              "buyerPhone", "buyerEmail", "buyerName", "status", "paymentStatus", "paidAt",
              "providerOrderId", "providerCode", "providerStatus", "providerMessage",
              "dispatchedAt", "completedAt", "agentId", "source", "agentCost", "agentCommission",
              "commissionStatus", "commissionPaidAt", "teamAgentId", "teamCommission",
              "teamCommissionStatus", "teamCommissionPaidAt", "userId", "createdAt", "updatedAt"],
  },
  {
    name: "AfaRegistration",
    columns: ["id", "reference", "fullName", "phoneNumber", "idNumber", "dateOfBirth", "town",
              "occupation", "price", "status", "paymentStatus", "paidAt", "providerId",
              "providerStatus", "providerMessage", "dispatchedAt", "completedAt", "agentId",
              "source", "agentCost", "agentCommission", "commissionStatus", "commissionPaidAt",
              "userId", "createdAt", "updatedAt"],
  },
  {
    name: "DataAgentPrice",
    columns: ["id", "agentId", "network", "sizeGb", "price", "isActive", "createdAt", "updatedAt"],
  },
  {
    name: "DataAgentLedger",
    columns: ["id", "agentId", "type", "amount", "balanceAfter", "narration", "reference",
              "sourceAgentId", "referralLevel", "dedupeKey", "createdAt"],
  },
  {
    name: "DataAgentWithdrawal",
    columns: ["id", "agentId", "amount", "fee", "momoPhone", "momoName", "momoNetwork", "status",
              "adminNote", "processedBy", "processedAt", "createdAt", "updatedAt"],
  },
  {
    name: "DataAnnouncement",
    columns: ["id", "title", "body", "tone", "isActive", "isPinned", "createdAt", "updatedAt"],
  },
  {
    name: "DataSupportRequest",
    columns: ["id", "agentId", "fullName", "phone", "language", "message", "status", "adminNote",
              "resolvedAt", "createdAt"],
  },
  {
    name: "DataAgentApplication",
    columns: ["id", "fullName", "phone", "email", "storeName", "desiredSlug", "note",
              "referralCode", "referrerId", "feeMethod", "status", "reviewedBy", "reviewedAt",
              "adminNote", "setupTokenHash", "setupExpiresAt", "agentId", "createdAt",
              "updatedAt", "termsAcceptedAt"],
  },
  {
    name: "DataSetting",
    columns: ["key", "value"],
  },
];

/**
 * The bundle settings that lived in the retail SiteSetting table before the
 * split. They are copied into DataSetting so the new console opens with the
 * prices and switches the admin had already chosen.
 */
const INHERITED_SETTING_KEYS = [
  "dataBundlesEnabled", "dataStoreName", "dataStoreTagline", "dataSupportWhatsapp",
  "dataAfaEnabled", "dataAfaPrice", "dataMarkupPercent", "dataLowBalanceThreshold",
  "agentProgramEnabled", "agentSetupFee", "agentWithdrawalFee", "agentMinWithdrawal",
  "agentAgentMarkupPercent", "agentSupportPhone", "agentSupportWhatsapp",
  "agentWhatsappGroup", "agentPitch",
];

const { PrismaClient } = await import("@prisma/client");
const source = new PrismaClient({ datasourceUrl: SOURCE_URL });
const dest = new PrismaClient({ datasourceUrl: DEST_URL });

const quote = (c) => `"${c}"`;

/** Rows are sent in batches; one INSERT per row would take minutes on a big ledger. */
const BATCH = 200;

async function copyTable({ name, columns }) {
  let rows;
  try {
    rows = await source.$queryRawUnsafe(
      `SELECT ${columns.map(quote).join(", ")} FROM ${quote(name)}`,
    );
  } catch {
    // A table the source never had (a database built after the split) is not an
    // error — there is simply nothing of it to move.
    log(`${name}: not present in the source database — skipping.`);
    return 0;
  }

  const already = Number(
    (await dest.$queryRawUnsafe(`SELECT COUNT(*)::int AS n FROM ${quote(name)}`))[0].n,
  );

  if (DRY_RUN) {
    log(`${name}: ${rows.length} in source, ${already} already in destination.`);
    return rows.length;
  }
  if (rows.length === 0) {
    log(`${name}: nothing to copy.`);
    return 0;
  }

  const key = name === "DataSetting" ? '"key"' : '"id"';
  let written = 0;
  for (let i = 0; i < rows.length; i += BATCH) {
    const slice = rows.slice(i, i + BATCH);
    const values = [];
    const params = [];
    for (const row of slice) {
      const placeholders = columns.map((c) => {
        params.push(row[c] ?? null);
        return `$${params.length}`;
      });
      values.push(`(${placeholders.join(", ")})`);
    }
    written += await dest.$executeRawUnsafe(
      `INSERT INTO ${quote(name)} (${columns.map(quote).join(", ")})
       VALUES ${values.join(", ")}
       ON CONFLICT (${key}) DO NOTHING`,
      ...params,
    );
  }
  log(`${name}: ${rows.length} read, ${written} written (${rows.length - written} already there).`);
  return written;
}

/** Second pass: an agent can be referred by one created after them. */
async function copyReferrals() {
  const rows = await source
    .$queryRawUnsafe(`SELECT "id", "referredById" FROM "DataAgent" WHERE "referredById" IS NOT NULL`)
    .catch(() => []);
  if (rows.length === 0) {
    log("DataAgent.referredById: nothing to link.");
    return;
  }
  if (DRY_RUN) {
    log(`DataAgent.referredById: ${rows.length} relationships to link.`);
    return;
  }
  for (const row of rows) {
    await dest.$executeRawUnsafe(
      `UPDATE "DataAgent" SET "referredById" = $1 WHERE "id" = $2 AND "referredById" IS NULL`,
      row.referredById,
      row.id,
    );
  }
  log(`DataAgent.referredById: linked ${rows.length}.`);
}

/** Bring the bundle settings across from the retail SiteSetting table. */
async function copySettings() {
  const rows = await source
    .$queryRawUnsafe(
      `SELECT "key", "value" FROM "SiteSetting" WHERE "key" = ANY($1::text[])`,
      INHERITED_SETTING_KEYS,
    )
    .catch(() => []);
  if (rows.length === 0) {
    log("settings: nothing inherited from the retail console.");
    return;
  }
  if (DRY_RUN) {
    log(`settings: ${rows.length} would be inherited from the retail console.`);
    return;
  }
  for (const row of rows) {
    await dest.$executeRawUnsafe(
      `INSERT INTO "DataSetting" ("key", "value") VALUES ($1, $2) ON CONFLICT ("key") DO NOTHING`,
      row.key,
      row.value,
    );
  }
  log(`settings: inherited ${rows.length} from the retail console.`);
}

try {
  log(DRY_RUN ? "dry run — counting only, nothing will be written." : "copying…");
  for (const table of TABLES) {
    await copyTable(table);
  }
  await copyReferrals();
  await copySettings();
  log(
    DRY_RUN
      ? "dry run finished. Run again without --dry-run to copy."
      : "done. The source tables were not touched — verify the console, then drop them by hand when you are ready.",
  );
} catch (err) {
  fail("copy failed. Nothing in the source database was changed.", err);
} finally {
  await source.$disconnect().catch(() => {});
  await dest.$disconnect().catch(() => {});
}
