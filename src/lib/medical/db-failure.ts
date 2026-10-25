/**
 * Reading a database failure out loud.
 *
 * The setup report asks the database one question — "which migrations are
 * recorded here?" — and the *failure* of that query is the answer it wants:
 * a database with no medical tables fails differently from one that cannot be
 * reached, and that distinction is the whole point of asking.
 *
 * Prisma states the cause at the end of a multi-line message, behind a header
 * that reads "Invalid `prisma.$queryRawUnsafe()` invocation:" and a code frame.
 * Printing the first line of that message gives a reason that reads as no
 * reason at all, which is what the report used to do. This picks out the line
 * that carries the cause and names what to do about it.
 *
 * Pure and string-only, so it is tested rather than guessed at.
 */

export type DatabaseFailureKind =
  /** The server answered and has no medical tables: the schema is not applied. */
  | "not-migrated"
  /** No answer: wrong host, wrong port, asleep, or no route to it. */
  | "unreachable"
  /** It answered and refused the credentials in the URL. */
  | "denied"
  /** The host is there; the database named in the URL is not. */
  | "no-database"
  /** None of the above matched — say so, and print everything. */
  | "unknown";

export type DatabaseFailure = {
  kind: DatabaseFailureKind;
  /** The one line worth reading, boilerplate stripped. */
  reason: string;
  /** What to do next, in a sentence. */
  advice: string;
  /** Every line that survived the boilerplate filter, in order. */
  detail: string[];
};

const ADVICE: Record<DatabaseFailureKind, string> = {
  "not-migrated":
    "The schema has not been applied to this database yet. It is applied by the build — deploy, then look in the build log for: [migrate] medical: applying …",
  unreachable:
    "Check MEDICAL_DATABASE_URL: the host and port it names did not answer. A Neon database that has been idle can also take a moment to wake — try once more.",
  denied:
    "The database answered and rejected the credentials. Copy MEDICAL_DATABASE_URL again from the database provider, including ?sslmode=require.",
  "no-database":
    "The server is reachable but has no database of that name. Check the path at the end of MEDICAL_DATABASE_URL.",
  unknown: "Read the lines above — this failure is not one of the ones with a known cause.",
};

/**
 * The lines of a Prisma error that say something. Dropped: the invocation
 * header, the code frame it prints beneath it, the file:line:col pointer, and
 * the braces around an argument dump.
 */
function meaningfulLines(message: string): string[] {
  return message
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .filter((line) => !/^Invalid `[^`]*` invocation/i.test(line))
    .filter((line) => !/^(→\s*)?\d+\s/.test(line))
    .filter((line) => !/:\d+:\d+$/.test(line))
    .filter((line) => line !== "{" && line !== "}");
}

/** First line matching any of the patterns, searched in order. */
function firstMatch(lines: string[], patterns: RegExp[]): string | undefined {
  for (const pattern of patterns) {
    const hit = lines.find((line) => pattern.test(line));
    if (hit) return hit;
  }
  return undefined;
}

export function describeDatabaseFailure(error: unknown): DatabaseFailure {
  const message = error instanceof Error ? error.message : String(error);
  const lines = meaningfulLines(message);
  const haystack = lines.join("\n");

  const classify = (): DatabaseFailureKind => {
    if (/relation "[^"]*" does not exist|\b42P01\b|\bno such table\b/i.test(haystack)) {
      return "not-migrated";
    }
    // Prisma names the database in backticks ("Database `neondb` does not
    // exist"); Postgres, when the message reaches us raw, in double quotes.
    if (/\bdatabase [`"][^`"]*[`"] does not exist|\b3D000\b|\bP1003\b/i.test(haystack)) {
      return "no-database";
    }
    if (
      /authentication failed|password authentication|\bP1000\b|\b28P01\b|no pg_hba\.conf entry/i.test(
        haystack,
      )
    ) {
      return "denied";
    }
    if (
      /can't reach database server|\bP1001\b|\bP1002\b|ECONNREFUSED|ENOTFOUND|EAI_AGAIN|ETIMEDOUT|connection refused|timed out|terminating connection|connection closed|server has closed the connection/i.test(
        haystack,
      )
    ) {
      return "unreachable";
    }
    return "unknown";
  };

  const kind = classify();

  // The cause, preferred over the first surviving line: Prisma wraps it in
  // "Raw query failed. Code: … Message: …" at the very end of the message.
  const reason =
    firstMatch(lines, [
      /relation "[^"]*" does not exist/i,
      /\bdatabase [`"][^`"]*[`"] does not exist/i,
      /authentication failed|password authentication|no pg_hba\.conf entry/i,
      /can't reach database server|ECONNREFUSED|ENOTFOUND|EAI_AGAIN|ETIMEDOUT|connection refused|timed out/i,
      /^Raw query failed/i,
    ]) ??
    lines.at(-1) ??
    (message.trim() || "no message");

  return { kind, reason, advice: ADVICE[kind], detail: lines };
}
