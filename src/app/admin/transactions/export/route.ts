import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/session";
import { getRetailTransactions } from "@/lib/retail-transactions";
import { kindLabel, transactionRange } from "@/lib/transaction-kinds";
import { workbookResponse, type Sheet } from "@/lib/xlsx";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * The mall's transactions as a spreadsheet.
 *
 * Signed, so the columns add up without anybody having to know which kinds are
 * money out — which is the whole reason somebody exports a ledger.
 */
export async function GET(req: Request) {
  try {
    await requireAdmin();
  } catch {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const sp = new URL(req.url).searchParams;

  try {
    const { rows } = await getRetailTransactions({
      kind: sp.get("kind") ?? "all",
      flow: sp.get("flow") ?? "all",
      days: transactionRange(sp.get("range") ?? undefined),
      query: sp.get("q") ?? "",
      page: 1,
      perPage: 20000,
    });

    const sheet: Sheet = {
      name: "Transactions",
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

    return workbookResponse([sheet], "retail-transactions");
  } catch (error) {
    console.error("[retail transactions export] failed", error);
    return NextResponse.json({ error: "Could not build the export." }, { status: 500 });
  }
}
