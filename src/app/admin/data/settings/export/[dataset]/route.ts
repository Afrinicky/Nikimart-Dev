import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/session";
import { buildDataExport, isDataExportDataset } from "@/lib/data-bundles/exports";
import { workbookResponse } from "@/lib/xlsx";
import { csvResponse } from "@/lib/data-bundles/csv";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// Some of these read every order or every ledger entry; give them room.
export const maxDuration = 120;

/**
 * Excel and CSV exports of the Data Bundles business.
 *
 * These workbooks carry agent contact details, payout accounts and the whole
 * commission ledger, so the admin check is not a formality — and because
 * `requireAdmin` redirects rather than throws for a signed-out visitor, which
 * is useless to a download, the redirect is caught and turned into a 403.
 *
 * `?format=csv` returns one sheet rather than the workbook, and `?sheet=`
 * picks which — a CSV cannot hold two.
 */
export async function GET(req: Request, { params }: { params: Promise<{ dataset: string }> }) {
  const { dataset } = await params;
  if (!isDataExportDataset(dataset)) {
    return NextResponse.json({ error: "Unknown export" }, { status: 404 });
  }

  try {
    await requireAdmin();
  } catch {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const url = new URL(req.url);
  const format = url.searchParams.get("format") === "csv" ? "csv" : "xlsx";
  const wanted = url.searchParams.get("sheet");

  try {
    const sheets = await buildDataExport(dataset);
    if (sheets.length === 0) {
      return NextResponse.json({ error: "Nothing to export." }, { status: 404 });
    }

    if (format === "csv") {
      const sheet = wanted ? sheets.find((s) => s.name === wanted) : sheets[0];
      if (!sheet) {
        return NextResponse.json(
          { error: `This export has no sheet called "${wanted}".` },
          { status: 404 },
        );
      }
      // The sheet name is in the filename so two CSVs from one export do not
      // land in Downloads with the same name.
      const slug = sheets.length > 1 ? `${dataset}-${slugify(sheet.name)}` : dataset;
      return csvResponse(sheet, slug);
    }

    return workbookResponse(sheets, dataset);
  } catch (error) {
    console.error(`[data-export] ${dataset} failed`, error);
    return NextResponse.json({ error: "Could not build the export." }, { status: 500 });
  }
}

function slugify(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}
