import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/session";
import { getWithdrawals } from "@/lib/data-bundles/withdrawals";
import { workbookResponse, type Sheet } from "@/lib/xlsx";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * The payout queue as a spreadsheet, honouring the filters the table had on.
 *
 * Built from the same read the page uses rather than a query of its own, so an
 * export is exactly what was on screen when the button was pressed — the one
 * property that makes an export worth reconciling against.
 */
export async function GET(req: Request) {
  try {
    await requireAdmin();
  } catch {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const sp = new URL(req.url).searchParams;

  try {
    const { rows } = await getWithdrawals({
      status: sp.get("status") ?? "pending",
      network: sp.get("network") ?? "all",
      query: sp.get("q") ?? "",
      page: 1,
      // Every matching row, not the page that happened to be open: a person
      // exporting wants the set, and pages are a screen-sized convenience.
      perPage: 10000,
    });

    const sheet: Sheet = {
      name: "Withdrawals",
      columns: [
        "Requested",
        "Store",
        "Agent code",
        "Pay to",
        "Network",
        "Name on account",
        "Amount",
        "Fee",
        "Taken off balance",
        "Status",
        "Handled",
        "Handled by",
        "Note",
      ],
      rows: rows.map((w) => [
        w.createdAt,
        w.agent.storeName,
        w.agent.code,
        w.momoPhone,
        w.momoNetwork,
        w.momoName,
        w.amount,
        w.fee,
        w.amount + w.fee,
        w.status,
        w.processedAt ?? "",
        w.processedBy ?? "",
        w.adminNote,
      ]),
    };

    return workbookResponse([sheet], "withdrawals");
  } catch (error) {
    console.error("[withdrawals export] failed", error);
    return NextResponse.json({ error: "Could not build the export." }, { status: 500 });
  }
}
