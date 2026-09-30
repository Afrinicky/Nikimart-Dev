import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/session";
import { dataDb } from "@/lib/data-db";
import {
  DATA_STATUS_LABELS,
  bundleLabel,
  isDataOrderStatus,
  networkLabel,
} from "@/lib/data-bundles/networks";
import { orderIncome, orderSourceLabel } from "@/lib/data-bundles/reporting";
import {
  orderNetworkWhere,
  orderSearchWhere,
  orderStatusWhere,
} from "@/lib/data-bundles/order-filters";
import { workbookResponse, type Sheet } from "@/lib/xlsx";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Excel export of bundle orders for the admin console, honouring the same
 * status and search filters as the table. Carries the agent attribution and
 * commission that the on-screen columns summarise.
 */
export async function GET(req: Request) {
  try {
    await requireAdmin();
  } catch {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const sp = new URL(req.url).searchParams;
  // One agent's sales rather than the whole storefront, for the same table
  // rendered inside that agent's admin window.
  const agentId = sp.get("agent");
  // The same filters the table applies, read the same way, so an export is
  // always exactly what was on screen when the button was pressed.
  const where: Record<string, unknown> = {
    ...(agentId ? { agentId } : {}),
    ...orderStatusWhere(sp.get("status")),
    ...orderNetworkWhere(sp.get("network")),
    ...orderSearchWhere(sp.get("q")),
  };

  try {
    const orders = await dataDb.dataOrder.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: 10000,
      include: { agent: { select: { storeName: true, code: true } } },
    });

    const sheet: Sheet = {
      name: "Bundle orders",
      columns: [
        "Order ID",
        // Every row of an agent's export is that same agent, so the column
        // would be one repeated name.
        ...(agentId ? [] : ["Source"]),
        "Network",
        "Size",
        "Recipient phone",
        "Buyer phone",
        "Buyer name",
        "Price",
        "Cost",
        "Commission",
        "Income",
        "Commission status",
        "Payment",
        "Status",
        "Provider status",
        "Date",
      ],
      rows: orders.map((o) => [
        o.reference,
        ...(agentId
          ? []
          : [
              orderSourceLabel({
                source: o.source,
                agentName: o.agent?.storeName ?? null,
                agentCode: o.agent?.code ?? null,
              }),
            ]),
        networkLabel(o.network),
        bundleLabel(o.sizeGb),
        o.recipientPhone,
        o.buyerPhone,
        o.buyerName ?? "",
        o.price,
        o.costPrice,
        o.agentCommission,
        orderIncome(o),
        o.commissionStatus,
        o.paymentStatus === "paid" ? "Payment success" : "Payment pending",
        isDataOrderStatus(o.status) ? DATA_STATUS_LABELS[o.status] : o.status,
        o.providerStatus ?? "",
        o.createdAt,
      ]),
    };

    const filename = agentId
      ? `bundle-orders-${orders[0]?.agent?.code?.toLowerCase() ?? "agent"}`
      : "bundle-orders";
    return workbookResponse([sheet], filename);
  } catch (error) {
    console.error("[admin orders export] failed", error);
    return NextResponse.json({ error: "Could not build the export." }, { status: 500 });
  }
}
