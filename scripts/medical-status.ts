/**
 * What state is the medical application in?
 *
 * Answers the question you have before and after every setup step: is the
 * database reachable, has the schema been applied, has it been seeded, and is
 * there anybody who can sign in to the console. Read-only — it writes nothing
 * and is safe against production.
 *
 *   MEDICAL_DATABASE_URL=… npx tsx scripts/medical-status.ts
 *
 * Exits non-zero only when the database cannot be reached or the schema is
 * missing, so it can be used as a gate. A database that is reachable but not
 * yet seeded is a normal state on the way to going live, not a failure.
 */
import { readdirSync } from "node:fs";
import path from "node:path";
import { PrismaClient } from ".prisma/medical-client";

const db = new PrismaClient();

async function main(): Promise<void> {
  if (!process.env.MEDICAL_DATABASE_URL?.trim()) {
    console.error("MEDICAL_DATABASE_URL is not set — there is no medical application here.");
    console.error("That is a valid state: /medicals renders its unconfigured page and");
    console.error("nothing else notices. Set it to switch the business on.");
    process.exit(1);
  }

  // Reachability and schema, as one question: a database with no medical
  // tables answers this query with an error, which is the distinction that
  // matters between "unreachable" and "not migrated".
  let applied: { name: string }[] = [];
  try {
    applied = await db.$queryRawUnsafe<{ name: string }[]>(
      `SELECT "name" FROM "_NikiMigration" ORDER BY "name"`,
    );
  } catch (error) {
    console.error("Could not read the migration record.");
    // The first non-empty line: a Prisma error message begins with a blank
    // one, and printing that gives a reason that reads as no reason at all.
    const reason =
      error instanceof Error
        ? (error.message.split("\n").find((line) => line.trim().length > 0) ?? error.message)
        : String(error);
    console.error(`  ${reason.trim()}`);
    console.error("\nEither the database is unreachable, or the schema has never been");
    console.error("applied. The schema is applied by the build — deploy, and check the");
    console.error("build log for lines reading: [migrate] medical: applying …");
    process.exit(1);
  }

  // Every row is this database's own: the runner keeps a separate record in
  // each target, so there is nothing to filter — a medical database lists the
  // medical files and nothing else. (Filtering on the word "medical" was a
  // bug: only the first file is named that way.)
  // What should be there, from the files in the repository.
  let expected: string[] = [];
  try {
    expected = readdirSync(path.join(process.cwd(), "db", "medical-migrations"))
      .filter((file) => file.endsWith(".sql"))
      .sort();
  } catch {
    // Run from somewhere without the repository: the comparison is skipped
    // rather than reported as everything missing.
  }

  const recorded = new Set(applied.map((row) => row.name));

  console.log("Schema");
  if (applied.length === 0) {
    console.log("  nothing recorded — the schema has never been applied here.");
  }
  for (const file of expected) {
    console.log(`  ${recorded.has(file) ? "applied " : "MISSING "} ${file}`);
  }

  // A recorded file that is not one of ours means this database has had
  // another target's runner pointed at it — the retail and bundle migrations
  // keep their record in their own databases. Worth saying plainly, because
  // the symptom otherwise is a confusing list and no explanation.
  const strangers = applied
    .map((row) => row.name)
    .filter((name) => expected.length > 0 && !expected.includes(name));
  if (strangers.length > 0) {
    console.log("\n  These are recorded here and are not medical migrations:");
    for (const name of strangers) console.log(`    ${name}`);
    console.log("  Another target's runner has been pointed at this database.");
    console.log("  Harmless to the medical tables, but check which URL is which.");
  }

  const missing = expected.filter((file) => !recorded.has(file));
  if (missing.length > 0) {
    console.log("\n  → the schema is behind. Deploy: the build applies these.");
  }

  // Counting through the generated client is also the check that this is a
  // medical database and not, say, the retail one with a migration table in
  // it: the query names medical tables, so the wrong database fails here with
  // something readable rather than reporting zeros as though it were empty.
  let products = 0;
  let categories = 0;
  let settings = 0;
  let staff = 0;
  let admins = 0;
  let suspended = 0;
  try {
    [products, categories, settings, staff, admins, suspended] = await Promise.all([
      db.medicalProduct.count(),
      db.medicalCategory.count(),
      db.medicalSetting.count(),
      db.medicalStaff.count(),
      db.medicalStaff.count({ where: { role: "ADMIN", isActive: true } }),
      db.medicalStaff.count({ where: { isActive: false } }),
    ]);
  } catch {
    console.error("\nThe medical tables are not in this database.");
    console.error("It has a migration record but no medical schema, which usually means");
    console.error("MEDICAL_DATABASE_URL is pointed at the retail or bundle database.");
    process.exit(1);
  }

  console.log("\nSeed");
  console.log(`  departments  ${categories}`);
  console.log(`  products     ${products}`);
  console.log(`  settings     ${settings}`);
  if (products === 0 || settings === 0) {
    console.log("  → not seeded yet. Run the seed step.");
  }

  console.log("\nWho can sign in");
  console.log(`  staff accounts        ${staff}`);
  console.log(`  active administrators ${admins}`);
  if (suspended > 0) console.log(`  suspended             ${suspended}`);
  if (admins === 0) {
    console.log("  → nobody can open the console. Run the grant-admin step.");
  }

  // Real business data, so that running this against the wrong database is
  // obvious rather than quietly destructive later.
  const [orgs, quotations, orders, poCount] = await Promise.all([
    db.organisation.count(),
    db.quotation.count(),
    db.salesOrder.count(),
    db.purchaseOrder.count(),
  ]);

  console.log("\nBusiness records");
  console.log(`  institutions    ${orgs}`);
  console.log(`  quotations      ${quotations}`);
  console.log(`  sales orders    ${orders}`);
  console.log(`  purchase orders ${poCount}`);
  if (orgs + quotations + orders + poCount === 0) {
    console.log("  → none yet, which is what a database before its first sale looks like.");
  }

  const ready = missing.length === 0 && products > 0 && settings > 0 && admins > 0;
  console.log(
    ready
      ? "\nReady: the schema is applied, it is seeded, and somebody can open the console."
      : "\nNot ready yet — see the arrows above for what is left.",
  );
}

main()
  .catch((error) => {
    console.error("\nFailed:", error instanceof Error ? error.message : error);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
