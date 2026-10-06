import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/session";
import { getTopups } from "@/lib/data-bundles/topups";
import { kindLabel, transactionRange } from "@/lib/transaction-kinds";
import { workbookResponse, type Sheet } from "@/lib/xlsx";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * The top-up list as a spreadsheet.
 *
 * Signed the same way the ledger export is: money onto a float is positive,
 * money out of Nickimart into the provider's wallet is negative, so the column
 * adds up to what was actually put in without anybody having to know which
 * kinds are which.
 */
export async function GET(req: Request) {
  try {
    await requireAdmin();
  } catch {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const sp = new URL(req.url).searchParams;

  try {
    const { rows } = await getTopups({
      kind: sp.get("kind") ?? "all",
      days: transactionRange(sp.get("range") ?? undefined),
      query: sp.get("q") ?? "",
      page: 1,
      perPage: 20000,
    });

    const sheet: Sheet = {
      name: "Top-ups",
      columns: ["Date", "Kind", "Direction", "Reference", "Who", "Detail", "Amount", "Status"],
      rows: rows.map((r) => [
        r.createdAt,
        kindLabel(r.kind),
        r.flow === "in" ? "Money in" : r.flow === "out" ? "Money out" : "Internal",
        r.reference,
        r.party,
        r.detail,
        r.flow === "out" ? -r.amount : r.amount,
        r.status,
      ]),
    };

    return workbookResponse([sheet], "bundle-topups");
  } catch (error) {
    console.error("[data topups export] failed", error);
    return NextResponse.json({ error: "Could not build the export." }, { status: 500 });
  }
}
