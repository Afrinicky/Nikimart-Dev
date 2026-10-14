import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/session";
import { getCommissionRows } from "@/lib/affiliate-console";
import { COMMISSION_STATUS_LABELS } from "@/lib/affiliate-ledger";
import { workbookResponse, type Sheet } from "@/lib/xlsx";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * The commission ledger as a spreadsheet — the statement an affiliate needs
 * when they are reconciling a payout against their own records.
 *
 * Every column the screen shows, including the ones that explain an amount
 * rather than state it: the rate, who funded it, which rule set it, and the
 * reason for any reversal.
 */
export async function GET(req: Request) {
  let affiliateId: string;
  try {
    const user = await requireUser();
    const affiliate = await prisma.affiliate.findUnique({
      where: { userId: user.id },
      select: { id: true },
    });
    if (!affiliate) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    affiliateId = affiliate.id;
  } catch {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const sp = new URL(req.url).searchParams;

  try {
    const { rows } = await getCommissionRows(affiliateId, {
      status: sp.get("status") ?? "all",
      q: sp.get("q") ?? "",
      page: 1,
      perPage: 10_000,
    });

    const sheet: Sheet = {
      name: "Commissions",
      columns: [
        "Order",
        "Product",
        "Quantity",
        "Line value",
        "Rate %",
        "Commission",
        "Reversed",
        "Net",
        "Funded by",
        "Rule",
        "Status",
        "Earned",
        "Clears",
        "Cleared",
        "Reversal reason",
      ],
      rows: rows.map((r) => [
        r.orderNumber,
        r.productName,
        r.quantity,
        r.baseAmount,
        r.rate,
        r.amount,
        r.reversedAmount,
        r.net,
        r.fundedBy === "platform" ? "Nickimart" : r.fundedBy === "seller" ? "The shop" : "",
        r.ruleSource,
        COMMISSION_STATUS_LABELS[r.status] ?? r.status,
        r.createdAt,
        r.holdUntil ?? "",
        r.clearedAt ?? "",
        r.reversalReason,
      ]),
    };

    return workbookResponse([sheet], "nickimart-affiliate-commissions");
  } catch (error) {
    console.error("[affiliate commissions export] failed", error);
    return NextResponse.json({ error: "Could not build the export." }, { status: 500 });
  }
}
