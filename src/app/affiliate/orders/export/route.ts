import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/session";
import { getReferredOrders } from "@/lib/affiliate-console";
import { COMMISSION_STATUS_LABELS } from "@/lib/affiliate-ledger";
import { ORDER_STATUS_LABELS } from "@/lib/order-status";
import { workbookResponse, type Sheet } from "@/lib/xlsx";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * The affiliate's referred orders as a spreadsheet, honouring the same filters
 * the table is showing — so an export is always exactly what was on screen
 * when the button was pressed.
 *
 * Scoped to the signed-in affiliate's own account, from their own session.
 * Nothing in the query string can widen that.
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
    const { rows } = await getReferredOrders(affiliateId, {
      status: sp.get("status") ?? "all",
      q: sp.get("q") ?? "",
      page: 1,
      perPage: 10_000,
    });

    const sheet: Sheet = {
      name: "Referred orders",
      columns: [
        "Order",
        "Date",
        "Buyer",
        "Products",
        "Order value",
        "Order status",
        "Your commission",
        "Commission status",
        "Clears",
      ],
      rows: rows.map((o) => [
        o.orderNumber,
        o.createdAt,
        o.buyer,
        o.products,
        o.subtotal,
        ORDER_STATUS_LABELS[o.status] ?? o.status,
        o.commission,
        COMMISSION_STATUS_LABELS[o.commissionStatus] ?? o.commissionStatus,
        o.holdUntil ?? "",
      ]),
    };

    return workbookResponse([sheet], "nickimart-referred-orders");
  } catch (error) {
    console.error("[affiliate orders export] failed", error);
    return NextResponse.json({ error: "Could not build the export." }, { status: 500 });
  }
}
