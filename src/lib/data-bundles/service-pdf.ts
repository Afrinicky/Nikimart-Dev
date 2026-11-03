// Relative imports with the extension: this module is covered by a *.test.ts
// run through Node's type stripping, which resolves neither the "@/…" alias
// nor a missing extension.

/**
 * The registration document, as a PDF.
 *
 * What an application is *for* is a sheet of paper somebody walks into the
 * Registrar-General's with: a numbered list of the applicant's particulars,
 * their proposed names, the purpose of the business and a note that the Ghana
 * Card images are attached. Until now that sheet was being typed out by hand
 * from what the customer had already typed into the form, which is both the
 * slowest part of the job and the one place a digit goes missing.
 *
 * Written by hand rather than with a library, for the reason the flyer is
 * drawn rather than screenshotted: it is one file format, the output is a
 * numbered list of lines, and the whole of what is needed is below — no
 * dependency to keep current, nothing to install, and no font to ship. The
 * fourteen base fonts are in every reader, so Helvetica costs nothing and
 * needs no embedding.
 *
 * Pure: strings and numbers in, bytes out. No database, no React, no browser,
 * so the layout and the wrapping can be tested on their own.
 */

// --- Page geometry (A4, in points) -----------------------------------------

const PAGE_WIDTH = 595.28;
const PAGE_HEIGHT = 841.89;
const MARGIN = 56;
const CONTENT_WIDTH = PAGE_WIDTH - MARGIN * 2;

const TITLE_SIZE = 16;
const META_SIZE = 9;
const BODY_SIZE = 11;
const LINE = 15.5;

/**
 * Helvetica's own character widths, in 1/1000 em, for printable ASCII.
 *
 * Needed because the wrapping has to agree with what the reader will draw. An
 * average-width guess is wrong by a word or two a line, which on a form means
 * a Ghana Card number broken across a line break.
 */
const HELVETICA = [
  278, 278, 355, 556, 556, 889, 667, 191, 333, 333, 389, 584, 278, 333, 278, 278,
  556, 556, 556, 556, 556, 556, 556, 556, 556, 556, 278, 278, 584, 584, 584, 556,
  1015, 667, 667, 722, 722, 667, 611, 778, 722, 278, 500, 667, 556, 833, 722, 778,
  667, 778, 722, 667, 611, 722, 667, 944, 667, 667, 611, 278, 278, 278, 469, 556,
  333, 556, 556, 500, 556, 556, 278, 556, 556, 222, 222, 500, 222, 833, 556, 556,
  556, 556, 333, 500, 278, 556, 500, 722, 500, 500, 500, 334, 260, 334, 584,
];

const HELVETICA_BOLD = [
  278, 333, 474, 556, 556, 889, 722, 238, 333, 333, 389, 584, 278, 333, 278, 278,
  556, 556, 556, 556, 556, 556, 556, 556, 556, 556, 333, 333, 584, 584, 584, 611,
  975, 722, 722, 722, 722, 667, 611, 778, 722, 278, 556, 722, 611, 833, 722, 778,
  667, 778, 722, 667, 611, 722, 667, 944, 667, 667, 611, 333, 278, 333, 584, 556,
  333, 556, 611, 556, 611, 556, 333, 611, 611, 278, 278, 556, 278, 889, 611, 611,
  611, 611, 389, 556, 333, 611, 556, 778, 556, 556, 500, 389, 280, 389, 584,
];

export type PdfFont = "regular" | "bold";

/** How wide this text is at this size, in points. */
export function textWidth(text: string, size: number, font: PdfFont = "regular"): number {
  const widths = font === "bold" ? HELVETICA_BOLD : HELVETICA;
  let total = 0;
  for (const ch of text) {
    const code = ch.charCodeAt(0);
    // Anything off the table is drawn as a space-ish box; 500 is the honest
    // middle of the range and keeps the wrapping from running long.
    total += code >= 32 && code <= 126 ? widths[code - 32] : 500;
  }
  return (total * size) / 1000;
}

/**
 * What a PDF string may hold.
 *
 * The base fonts are WinAnsi, so the cedi sign, curly quotes and dashes that
 * come out of a web form have to become something that exists in it. Mapped
 * rather than stripped: a price that reads "GHS450.00" is right, and one that
 * reads "450.00" with the currency silently gone is not.
 */
export function toWinAnsi(text: string): string {
  return text
    // "GH₵450" is the usual spelling, so the sign is taken with the GH that
    // precedes it; a bare one becomes the same three letters on its own.
    .replace(/GH\s*₵\s*/g, "GHS ")
    .replace(/₵\s*/g, "GHS ")
    .replace(/[‘’‛]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[–—]/g, "-")
    .replace(/…/g, "...")
    .replace(/ /g, " ")
    // WinAnsi matches Latin-1 from A0 up, so the separator dot, the degree
    // sign and accented letters are all drawable and are kept. Everything
    // above that range has no glyph in the base fonts and is dropped rather
    // than drawn as a box.
    .replace(/[^\x20-\x7E\xA0-\xFF]/g, "")
    .replace(/[ \t]+/g, " ");
}

/** Escape what a PDF literal string cannot hold raw. */
function pdfString(text: string): string {
  return toWinAnsi(text).replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");
}

/** Break text to a width, on spaces where it can and mid-word where it must. */
export function wrap(text: string, width: number, size: number, font: PdfFont = "regular"): string[] {
  const clean = toWinAnsi(text).trim();
  if (!clean) return [];

  const lines: string[] = [];
  for (const paragraph of clean.split("\n")) {
    const words = paragraph.split(" ").filter((w) => w !== "");
    if (words.length === 0) {
      lines.push("");
      continue;
    }

    let line = "";
    for (const word of words) {
      const candidate = line ? `${line} ${word}` : word;
      if (textWidth(candidate, size, font) <= width) {
        line = candidate;
        continue;
      }
      if (line) lines.push(line);

      // A single word wider than the column — a long reference, a pasted URL —
      // is cut rather than allowed to run off the page.
      let rest = word;
      while (textWidth(rest, size, font) > width) {
        let cut = rest.length - 1;
        while (cut > 1 && textWidth(rest.slice(0, cut), size, font) > width) cut--;
        lines.push(rest.slice(0, cut));
        rest = rest.slice(cut);
      }
      line = rest;
    }
    if (line) lines.push(line);
  }
  return lines;
}

// --- The document ----------------------------------------------------------

export interface PdfEntry {
  label: string;
  value: string;
}

export interface PdfSection {
  /** Printed above its entries. Empty runs the entries straight on. */
  heading: string;
  entries: PdfEntry[];
}

export interface RegistrationDocument {
  /** "Business registration", "Passport application". */
  title: string;
  /** "Sole Proprietorship" — what was chosen. */
  subtitle: string;
  /** Reference, date, speed: the line under the title. */
  meta: string[];
  sections: PdfSection[];
  /** The closing note — what is attached, and who prepared it. */
  footnotes: string[];
}

/** One drawing instruction, in page coordinates. */
interface Op {
  text: string;
  x: number;
  y: number;
  size: number;
  font: PdfFont;
}

/**
 * Lay the document out into pages.
 *
 * Separated from the bytes so the arithmetic — what lands on which page, where
 * a long answer wraps, when a heading is left stranded at the foot — can be
 * read and tested without a PDF parser.
 */
export function layout(doc: RegistrationDocument): Op[][] {
  const pages: Op[][] = [];
  let page: Op[] = [];
  let y = PAGE_HEIGHT - MARGIN;

  const bottom = MARGIN + 28; // room for the page number

  function newPage() {
    pages.push(page);
    page = [];
    y = PAGE_HEIGHT - MARGIN;
  }

  function room(height: number) {
    if (y - height < bottom) newPage();
  }

  // --- Title block ---------------------------------------------------------
  page.push({ text: doc.title, x: MARGIN, y, size: TITLE_SIZE, font: "bold" });
  y -= TITLE_SIZE + 6;

  if (doc.subtitle) {
    page.push({ text: doc.subtitle, x: MARGIN, y, size: BODY_SIZE + 1, font: "bold" });
    y -= BODY_SIZE + 8;
  }
  for (const line of doc.meta) {
    page.push({ text: line, x: MARGIN, y, size: META_SIZE, font: "regular" });
    y -= META_SIZE + 3;
  }
  y -= 12;

  // --- Numbered entries ----------------------------------------------------
  // One run of numbers across the whole document, as the paper version has:
  // the sections are there to group what is being read, not to restart it.
  let n = 0;
  const numberColumn = 26;
  const labelWidth = CONTENT_WIDTH - numberColumn;

  for (const section of doc.sections) {
    if (section.entries.length === 0) continue;

    if (section.heading) {
      room(LINE * 2);
      y -= 4;
      page.push({ text: section.heading.toUpperCase(), x: MARGIN, y, size: META_SIZE, font: "bold" });
      y -= META_SIZE + 8;
    }

    for (const entry of section.entries) {
      n++;
      const text = entry.value ? `${entry.label}: ${entry.value}` : `${entry.label}:`;
      const lines = wrap(text, labelWidth, BODY_SIZE);
      room(LINE * Math.min(lines.length, 3));

      lines.forEach((line, i) => {
        if (y < bottom) newPage();
        if (i === 0) {
          page.push({ text: `${n}.`, x: MARGIN, y, size: BODY_SIZE, font: "bold" });
        }
        page.push({ text: line, x: MARGIN + numberColumn, y, size: BODY_SIZE, font: "regular" });
        y -= LINE;
      });
      y -= 3;
    }
  }

  // --- Footnotes -----------------------------------------------------------
  if (doc.footnotes.length > 0) {
    room(LINE * 2);
    y -= 10;
    for (const note of doc.footnotes) {
      for (const line of wrap(note, CONTENT_WIDTH, META_SIZE)) {
        if (y < bottom) newPage();
        page.push({ text: line, x: MARGIN, y, size: META_SIZE, font: "regular" });
        y -= META_SIZE + 4;
      }
    }
  }

  pages.push(page);
  return pages;
}

/** One page's content stream. */
function stream(ops: Op[], pageNumber: number, pageCount: number): string {
  const parts: string[] = ["BT"];
  let font: PdfFont | null = null;
  let size = 0;

  for (const op of ops) {
    if (op.font !== font || op.size !== size) {
      font = op.font;
      size = op.size;
      parts.push(`/${font === "bold" ? "F2" : "F1"} ${size} Tf`);
    }
    parts.push(`1 0 0 1 ${op.x.toFixed(2)} ${op.y.toFixed(2)} Tm`);
    parts.push(`(${pdfString(op.text)}) Tj`);
  }

  // The page number, in the same pass so every page carries one.
  const label = `Page ${pageNumber} of ${pageCount}`;
  parts.push("/F1 8 Tf");
  parts.push(
    `1 0 0 1 ${(PAGE_WIDTH - MARGIN - textWidth(label, 8)).toFixed(2)} ${(MARGIN - 14).toFixed(2)} Tm`,
  );
  parts.push(`(${pdfString(label)}) Tj`);
  parts.push("ET");

  return parts.join("\n");
}

/**
 * The finished file.
 *
 * A flat PDF 1.4: a catalogue, a page tree, two base fonts and one content
 * stream per page, with a cross-reference table built from the byte offsets as
 * they are written. Latin-1 out, because every byte written here is WinAnsi by
 * the time it gets this far.
 */
export function buildRegistrationPdf(doc: RegistrationDocument): Uint8Array {
  const pages = layout(doc);
  const count = pages.length;

  const objects: string[] = [];
  // 1 catalogue, 2 page tree, 3 and 4 the fonts; pages and their streams after.
  const firstPageObj = 5;

  objects.push("<< /Type /Catalog /Pages 2 0 R >>");
  objects.push(
    `<< /Type /Pages /Count ${count} /Kids [${pages
      .map((_, i) => `${firstPageObj + i * 2} 0 R`)
      .join(" ")}] >>`,
  );
  objects.push("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>");
  objects.push(
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>",
  );

  pages.forEach((ops, i) => {
    const pageObj = firstPageObj + i * 2;
    const streamObj = pageObj + 1;
    objects.push(
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${PAGE_WIDTH.toFixed(2)} ${PAGE_HEIGHT.toFixed(
        2,
      )}] /Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> /Contents ${streamObj} 0 R >>`,
    );
    const body = stream(ops, i + 1, count);
    objects.push(`<< /Length ${body.length} >>\nstream\n${body}\nendstream`);
  });

  let out = "%PDF-1.4\n";
  const offsets: number[] = [];
  objects.forEach((body, i) => {
    offsets.push(out.length);
    out += `${i + 1} 0 obj\n${body}\nendobj\n`;
  });

  const xref = out.length;
  out += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (const offset of offsets) {
    out += `${String(offset).padStart(10, "0")} 00000 n \n`;
  }
  out += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;

  // Latin-1: every character left in `out` is inside it, and writing UTF-8
  // would put two bytes where the cross-reference table promised one.
  const bytes = new Uint8Array(out.length);
  for (let i = 0; i < out.length; i++) bytes[i] = out.charCodeAt(i) & 0xff;
  return bytes;
}

/** A filename somebody can find again in a folder of downloads. */
export function registrationFileName(reference: string, name: string): string {
  const who = toWinAnsi(name).replace(/[^\w]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40);
  return `${reference}${who ? `-${who}` : ""}.pdf`;
}
