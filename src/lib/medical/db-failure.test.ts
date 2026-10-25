import assert from "node:assert/strict";
import test from "node:test";
import { describeDatabaseFailure } from "./db-failure.ts";

/**
 * The messages below are the real thing, copied from Prisma 6 rather than
 * invented: the header, the blank lines and the code frame are what the parser
 * has to see past.
 */
/** Verbatim, Prisma 6.19 against a Postgres without the table. */
const missingTable =
  "\nInvalid `prisma.$queryRawUnsafe()` invocation:\n\n\n" +
  'Raw query failed. Code: `42P01`. Message: `relation "_NikiMigration" does not exist`';

/** The same failure where Prisma could locate the call site and print a frame. */
const missingTableWithFrame = `
Invalid \`prisma.$queryRawUnsafe()\` invocation in
/app/scripts/medical-status.ts:34:18

  32 try {
→ 34   applied = await db.$queryRawUnsafe(
Raw query failed. Code: \`42P01\`. Message: \`relation "_NikiMigration" does not exist\`
`;

/** Verbatim, Prisma 6.19 against a port with nothing listening on it. */
const unreachable =
  "\nInvalid `prisma.$queryRawUnsafe()` invocation:\n\n\n" +
  "Can't reach database server at `127.0.0.1:1`\n\n" +
  "Please make sure your database server is running at `127.0.0.1:1`.";

test("a missing table is the schema, not the network", () => {
  const f = describeDatabaseFailure(new Error(missingTable));
  assert.equal(f.kind, "not-migrated");
  assert.match(f.reason, /relation "_NikiMigration" does not exist/);
  assert.match(f.advice, /applied by the build/);
});

test("the reason never comes back as Prisma's own header", () => {
  for (const message of [missingTable, missingTableWithFrame, unreachable]) {
    const f = describeDatabaseFailure(new Error(message));
    assert.doesNotMatch(f.reason, /invocation/i);
    assert.notEqual(f.reason.trim(), "");
  }
});

test("a code frame is not mistaken for the cause", () => {
  const f = describeDatabaseFailure(new Error(missingTableWithFrame));
  assert.equal(f.kind, "not-migrated");
  assert.match(f.reason, /relation "_NikiMigration" does not exist/);
  assert.ok(!f.detail.some((line) => /^→/.test(line)));
  assert.ok(!f.detail.some((line) => /medical-status\.ts:34:18$/.test(line)));
});

test("no answer from the server reads as unreachable", () => {
  const f = describeDatabaseFailure(new Error(unreachable));
  assert.equal(f.kind, "unreachable");
  assert.match(f.reason, /Can't reach database server/);
  assert.match(f.advice, /MEDICAL_DATABASE_URL/);
});

test("refused credentials are their own answer", () => {
  const f = describeDatabaseFailure(
    new Error("Authentication failed against database server, the provided database credentials for `niki` are not valid."),
  );
  assert.equal(f.kind, "denied");
  assert.match(f.advice, /credentials/);
});

test("a database that is not there is not a database that is asleep", () => {
  // Verbatim: Prisma backticks the name, where Postgres would quote it.
  const prisma = describeDatabaseFailure(
    new Error("\nInvalid `prisma.$queryRawUnsafe()` invocation:\n\n\nDatabase `nosuchdb` does not exist"),
  );
  assert.equal(prisma.kind, "no-database");
  assert.match(prisma.reason, /Database `nosuchdb` does not exist/);

  const raw = describeDatabaseFailure(
    new Error('Raw query failed. Code: `3D000`. Message: `ERROR: database "neondb_old" does not exist`'),
  );
  assert.equal(raw.kind, "no-database");
  assert.match(raw.reason, /database "neondb_old" does not exist/);
});

test("a refused socket is unreachable even without Prisma's wording", () => {
  const f = describeDatabaseFailure(new Error("connect ECONNREFUSED 127.0.0.1:55432"));
  assert.equal(f.kind, "unreachable");
});

test("an unrecognised failure says so and keeps every line", () => {
  const f = describeDatabaseFailure(new Error("Invalid `prisma.x()` invocation:\n\nSomething else entirely\nand a second line"));
  assert.equal(f.kind, "unknown");
  assert.deepEqual(f.detail, ["Something else entirely", "and a second line"]);
  assert.equal(f.reason, "and a second line");
});

test("a thrown non-error is still described", () => {
  const f = describeDatabaseFailure("boom");
  assert.equal(f.kind, "unknown");
  assert.equal(f.reason, "boom");
});

test("an empty message does not print an empty reason", () => {
  const f = describeDatabaseFailure(new Error(""));
  assert.equal(f.reason, "no message");
});
