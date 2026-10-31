import { NextResponse } from "next/server";
import { requireDataAdminAction } from "@/lib/data-bundles/session";
import { workbookResponse } from "@/lib/xlsx";
import { CONTACT_COLUMNS, contactRows } from "@/lib/messenger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * The contact book as a spreadsheet.
 *
 * In the same column order the importer reads, so an export is a round trip:
 * download it, fix the forty numbers that changed, upload it back. A contact
 * list is people's phone numbers, so the admin check is not optional — and
 * `requireDataAdminAction` redirects rather than throws, which is no use to a download,
 * hence the 403.
 */
export async function GET() {
  try {
    await requireDataAdminAction();
  } catch {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const rows = await contactRows("data");
    return workbookResponse(
      [{ name: "Contacts", columns: CONTACT_COLUMNS, rows }],
      "nickimart-data-contacts",
    );
  } catch (error) {
    console.error("[messenger] contact export failed", error);
    return NextResponse.json({ error: "Could not build the export." }, { status: 500 });
  }
}
