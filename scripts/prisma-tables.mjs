/**
 * The tables a Prisma schema defines, read from the schema itself.
 *
 * Written because the alternative — a list of table names typed into a script
 * by hand — is a list that stops being true the moment somebody adds a model,
 * and stops being true silently. `scripts/copy-data-db.mjs` was written that
 * way and drifted from 11 tables to 35 without anybody noticing, because a
 * table missing from the list is not an error: it is simply not copied.
 *
 * Deriving the list from the schema makes adding a model the only thing a
 * developer has to do. Nothing has to be remembered twice.
 */

import { readFileSync } from "node:fs";

/**
 * Model names, and the table each one maps to.
 *
 * Prisma names the table after the model unless `@@map("…")` says otherwise,
 * so both are reported: the model name is what a developer searches for, and
 * the table name is what SQL needs.
 */
export function modelsIn(schemaPath) {
  const text = readFileSync(schemaPath, "utf8");
  const models = [];

  // Block-aware rather than line-aware: `@@map` belongs to whichever model's
  // braces it sits inside, and a regex over the whole file would attach it to
  // the wrong one.
  const re = /^model\s+(\w+)\s*\{/gm;
  let m;
  while ((m = re.exec(text)) !== null) {
    const name = m[1];
    const bodyStart = re.lastIndex;
    const end = text.indexOf("\n}", bodyStart);
    const body = end === -1 ? text.slice(bodyStart) : text.slice(bodyStart, end);
    const mapped = body.match(/@@map\(\s*"([^"]+)"\s*\)/);
    models.push({ model: name, table: mapped ? mapped[1] : name });
  }

  return models;
}

/** Just the table names, sorted, for comparing against a live database. */
export function tablesIn(schemaPath) {
  return modelsIn(schemaPath).map((m) => m.table).sort();
}
