import type { CellValue, Sheet } from "../xlsx.ts";

/**
 * A sheet as CSV.
 *
 * Offered beside the Excel workbook because the two get used differently: a
 * workbook is what somebody opens, and a CSV is what somebody feeds to an
 * accounting package or a script. Only one sheet comes out, so a multi-sheet
 * export has to say which — there is no CSV for "a workbook".
 *
 * Quoting is the whole job. A narration with a comma in it, an admin note with
 * a newline, a store name with a quotation mark: each one silently shifts every
 * column after it if it goes out unquoted, and a column shifted by one is a
 * number read against the wrong label.
 */

export function sheetToCsv(sheet: Sheet): string {
  const lines = [sheet.columns.map(csvCell).join(",")];
  for (const row of sheet.rows) lines.push(row.map(csvCell).join(","));
  // CRLF, because that is what RFC 4180 says and what Excel on Windows expects.
  return lines.join("\r\n");
}

function csvCell(value: CellValue): string {
  if (value === null || value === undefined) return "";
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (typeof value === "number") return Number.isFinite(value) ? String(value) : "";

  const text = String(value);
  // Quote when the text contains anything that would otherwise end the field,
  // and double any quotes inside it.
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

/**
 * The response, with the byte-order mark Excel needs.
 *
 * Without it Excel on Windows reads a UTF-8 file as the system code page and
 * turns GH₵ into mojibake in the first column anybody looks at.
 */
export function csvResponse(sheet: Sheet, filename: string): Response {
  const body = Buffer.from(`﻿${sheetToCsv(sheet)}`, "utf8");
  const stamp = new Date().toISOString().slice(0, 10);
  return new Response(new Uint8Array(body), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="nickimart-${filename}-${stamp}.csv"`,
      "Content-Length": String(body.length),
      "Cache-Control": "no-store",
    },
  });
}
