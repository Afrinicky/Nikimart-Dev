import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/session";
import { buildExport, isExportDataset } from "@/lib/exports";
import { workbookResponse } from "@/lib/xlsx";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Excel export for an admin console tab.
 *
 * These workbooks contain payout details, contact details, and the full
 * commission ledger, so the admin check is not optional — and because
 * `requireAdmin` redirects rather than throws for signed-out visitors, the
 * redirect is caught and turned into a 403 for a fetch/download context.
 */
export async function GET(_req: Request, { params }: { params: Promise<{ dataset: string }> }) {
  const { dataset } = await params;
  if (!isExportDataset(dataset)) {
    return NextResponse.json({ error: "Unknown export" }, { status: 404 });
  }

  try {
    await requireAdmin();
  } catch {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const sheets = await buildExport(dataset);
    return workbookResponse(sheets, dataset);
  } catch (error) {
    console.error(`[export] ${dataset} failed`, error);
    return NextResponse.json({ error: "Could not build the export." }, { status: 500 });
  }
}
