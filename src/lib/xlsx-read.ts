import { inflateRawSync } from "zlib";

/**
 * A minimal .xlsx and .csv reader, for a spreadsheet somebody uploads.
 *
 * The twin of lib/xlsx.ts, which writes them. Reading is the harder half and
 * still small enough to do here: an xlsx is a ZIP of XML, so this walks the
 * ZIP's central directory, inflates the two parts that matter — the shared
 * string table and the first worksheet — and reads the cells out. Pulling in a
 * spreadsheet library and its dependency tree for that is a poor trade on a
 * server that already ships its own writer.
 *
 * What it deliberately does not do: formulas, dates as dates, multiple sheets,
 * styles. A contact list is text in columns. Anything richer should be saved
 * as CSV, which this also reads.
 *
 * Everything here treats the file as hostile. An upload is somebody else's
 * bytes, and the failure mode has to be "that file could not be read", never a
 * thrown error taking a page down with it.
 *
 * Not marked server-only, unlike the writer next door, because it is pure and
 * worth testing directly — and importing it into a client component would
 * fail loudly on `zlib` anyway, which is the guard that marker was standing
 * in for.
 */

/** Nothing sane is bigger; past this it is an attack or a mistake. */
const MAX_ENTRY_BYTES = 40 * 1024 * 1024;
const MAX_ROWS = 20_000;

export interface SheetData {
  /** The first row, which a spreadsheet uses as headers. */
  header: string[];
  rows: string[][];
}

// ---------------------------------------------------------------------------
// ZIP
// ---------------------------------------------------------------------------

interface ZipEntry {
  name: string;
  compression: number;
  offset: number;
  compressedSize: number;
  uncompressedSize: number;
}

/**
 * The ZIP central directory, read backwards from the end-of-directory record.
 *
 * Backwards because that is how a ZIP is meant to be read: the index lives at
 * the end, and scanning forwards through local headers guesses at sizes that
 * streamed entries do not carry.
 */
function readDirectory(buf: Buffer): ZipEntry[] {
  // The EOCD is 22 bytes plus a comment of up to 64KB; scan back for its magic.
  let eocd = -1;
  const from = Math.max(0, buf.length - 22 - 0xffff);
  for (let i = buf.length - 22; i >= from; i -= 1) {
    if (buf.readUInt32LE(i) === 0x06054b50) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) return [];

  const count = buf.readUInt16LE(eocd + 10);
  let p = buf.readUInt32LE(eocd + 16);
  const entries: ZipEntry[] = [];

  for (let i = 0; i < count; i += 1) {
    if (p + 46 > buf.length || buf.readUInt32LE(p) !== 0x02014b50) break;
    const compression = buf.readUInt16LE(p + 10);
    const compressedSize = buf.readUInt32LE(p + 20);
    const uncompressedSize = buf.readUInt32LE(p + 24);
    const nameLen = buf.readUInt16LE(p + 28);
    const extraLen = buf.readUInt16LE(p + 30);
    const commentLen = buf.readUInt16LE(p + 32);
    const offset = buf.readUInt32LE(p + 42);
    const name = buf.subarray(p + 46, p + 46 + nameLen).toString("utf8");
    entries.push({ name, compression, offset, compressedSize, uncompressedSize });
    p += 46 + nameLen + extraLen + commentLen;
  }
  return entries;
}

/** The bytes of one entry, inflated if it needs it. */
function readEntry(buf: Buffer, entry: ZipEntry): string | null {
  if (entry.uncompressedSize > MAX_ENTRY_BYTES) return null;
  const p = entry.offset;
  if (p + 30 > buf.length || buf.readUInt32LE(p) !== 0x04034b50) return null;

  // The local header repeats the name and extra field, at its own lengths —
  // they are not always the central directory's, so read them from here.
  const nameLen = buf.readUInt16LE(p + 26);
  const extraLen = buf.readUInt16LE(p + 28);
  const start = p + 30 + nameLen + extraLen;
  const raw = buf.subarray(start, start + entry.compressedSize);

  try {
    if (entry.compression === 0) return raw.toString("utf8");
    if (entry.compression === 8) return inflateRawSync(raw).toString("utf8");
    return null;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// The XML inside
// ---------------------------------------------------------------------------

function unescapeXml(value: string): string {
  return value
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#x([0-9a-fA-F]+);/g, (_, hex: string) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, dec: string) => String.fromCodePoint(Number(dec)))
    // Last, so an escaped ampersand cannot turn into a second entity.
    .replace(/&amp;/g, "&");
}

/** All the text inside an element, tags stripped. Enough for <si> and <is>. */
function textOf(xml: string): string {
  return unescapeXml(xml.replace(/<[^>]*>/g, ""));
}

/** The workbook's shared string table, in order — cells index into it. */
function readSharedStrings(xml: string | null): string[] {
  if (!xml) return [];
  const out: string[] = [];
  for (const m of xml.matchAll(/<si(?:\s[^>]*)?>([\s\S]*?)<\/si>|<si\s*\/>/g)) {
    out.push(m[1] === undefined ? "" : textOf(m[1]));
  }
  return out;
}

/** "BC12" → 54. The column, as a zero-based index. */
function columnIndex(ref: string): number {
  const letters = ref.replace(/[^A-Z]/gi, "").toUpperCase();
  let n = 0;
  for (const ch of letters) n = n * 26 + (ch.charCodeAt(0) - 64);
  return Math.max(0, n - 1);
}

function readSheet(xml: string, shared: string[]): string[][] {
  const rows: string[][] = [];

  for (const rowMatch of xml.matchAll(/<row(?:\s[^>]*)?>([\s\S]*?)<\/row>/g)) {
    if (rows.length >= MAX_ROWS) break;
    const cells: string[] = [];

    for (const cellMatch of rowMatch[1].matchAll(
      /<c([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g,
    )) {
      const attrs = cellMatch[1] ?? "";
      const inner = cellMatch[2] ?? "";
      const ref = /r="([A-Z]+\d+)"/i.exec(attrs)?.[1] ?? "";
      const type = /t="([^"]+)"/.exec(attrs)?.[1] ?? "n";

      let value = "";
      if (type === "s") {
        // Shared string: <v> holds the index into the table.
        const idx = Number(/<v>([\s\S]*?)<\/v>/.exec(inner)?.[1] ?? "");
        value = Number.isInteger(idx) ? (shared[idx] ?? "") : "";
      } else if (type === "inlineStr") {
        value = textOf(/<is>([\s\S]*?)<\/is>/.exec(inner)?.[1] ?? "");
      } else {
        value = unescapeXml(/<v>([\s\S]*?)<\/v>/.exec(inner)?.[1] ?? "");
      }

      // Honour the cell's own reference: a sheet skips empty cells entirely,
      // so reading them in sequence silently shifts every later column left.
      const at = ref ? columnIndex(ref) : cells.length;
      while (cells.length < at) cells.push("");
      cells[at] = value.trim();
    }

    rows.push(cells);
  }

  return rows;
}

/**
 * Read the first worksheet of an .xlsx.
 *
 * The first sheet rather than a named one: somebody exporting from this
 * console and sending it back has one sheet, and asking a market trader which
 * tab their contacts are on is not a question worth asking.
 */
export function readXlsx(buf: Buffer): SheetData | null {
  const entries = readDirectory(buf);
  if (entries.length === 0) return null;

  const sheetEntry =
    entries.find((e) => /^xl\/worksheets\/sheet1\.xml$/i.test(e.name)) ??
    entries.find((e) => /^xl\/worksheets\/.*\.xml$/i.test(e.name));
  if (!sheetEntry) return null;

  const sheetXml = readEntry(buf, sheetEntry);
  if (!sheetXml) return null;

  const sharedEntry = entries.find((e) => /^xl\/sharedStrings\.xml$/i.test(e.name));
  const shared = readSharedStrings(sharedEntry ? readEntry(buf, sharedEntry) : null);

  const rows = readSheet(sheetXml, shared);
  return splitHeader(rows);
}

// ---------------------------------------------------------------------------
// CSV
// ---------------------------------------------------------------------------

/**
 * Read a CSV, including the quoting Excel writes.
 *
 * A hand-rolled parser rather than split(","), because a contact's note is
 * exactly the field that will contain a comma, and "Mensah, Ama" split into
 * two columns is how an import quietly shifts every later column.
 */
export function readCsv(text: string): SheetData {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;

  // A BOM from Excel would otherwise become part of the first header.
  const input = text.replace(/^﻿/, "");

  for (let i = 0; i < input.length; i += 1) {
    const ch = input[i];

    if (quoted) {
      if (ch === '"') {
        if (input[i + 1] === '"') {
          field += '"';
          i += 1;
        } else quoted = false;
      } else field += ch;
      continue;
    }

    if (ch === '"') quoted = true;
    else if (ch === ",") {
      row.push(field);
      field = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && input[i + 1] === "\n") i += 1;
      row.push(field);
      field = "";
      if (row.some((c) => c.trim())) rows.push(row.map((c) => c.trim()));
      row = [];
      if (rows.length >= MAX_ROWS) break;
    } else field += ch;
  }

  row.push(field);
  if (row.some((c) => c.trim())) rows.push(row.map((c) => c.trim()));

  return splitHeader(rows);
}

function splitHeader(rows: string[][]): SheetData {
  const meaningful = rows.filter((r) => r.some((c) => c !== ""));
  if (meaningful.length === 0) return { header: [], rows: [] };
  return { header: meaningful[0].map((h) => h.trim()), rows: meaningful.slice(1) };
}

/** Read whichever of the two formats this file is. */
export function readSpreadsheet(filename: string, buf: Buffer): SheetData | null {
  if (/\.csv$|\.txt$/i.test(filename)) return readCsv(buf.toString("utf8"));
  // An xlsx always starts "PK". Trusting the extension over the bytes is how a
  // renamed CSV becomes an unreadable workbook.
  if (buf.length > 1 && buf[0] === 0x50 && buf[1] === 0x4b) return readXlsx(buf);
  return readCsv(buf.toString("utf8"));
}

/**
 * Work out which column is which from the header row.
 *
 * Nobody's spreadsheet has the columns in this console's order, and asking
 * them to rearrange it is how an import feature goes unused. Anything that
 * reads like a name, a number or an address is matched; a sheet with no
 * recognisable header falls back to position, which is the shape this console
 * exports.
 */
export function mapColumns(header: string[]): Record<string, number> {
  const find = (...patterns: RegExp[]): number =>
    header.findIndex((h) => patterns.some((p) => p.test(h.trim())));

  const map: Record<string, number> = {
    name: find(/^(full\s*)?name$/i, /contact/i, /^customer/i),
    phone: find(/phone/i, /mobile/i, /^tel/i, /msisdn/i, /number$/i),
    email: find(/e-?mail/i),
    tags: find(/group/i, /tag/i, /list/i, /segment/i),
    note: find(/note/i, /comment/i, /remark/i),
  };

  // No header this recognises: treat it as our own export's column order.
  if (map.name < 0 && map.phone < 0 && map.email < 0) {
    return { name: 0, phone: 1, email: 2, tags: 3, note: 4 };
  }
  return map;
}
