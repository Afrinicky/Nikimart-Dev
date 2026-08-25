import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import {
  DATA_STATUS_LABELS,
  bundleLabel,
  isDataOrderStatus,
  networkLabel,
} from "@/lib/data-bundles/networks";
import { orderSourceLabel } from "@/lib/data-bundles/reporting";
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
  const status = sp.get("status") ?? "all";
  const query = (sp.get("q") ?? "").trim();

  const where: Record<string, unknown> = {};
  if (status !== "all" && isDataOrderStatus(status)) where.status = status;
  if (query) {
    const digits = query.replace(/\D/g, "");
    where.OR = [
      { reference: { contains: query.toUpperCase() } },
      ...(digits
        ? [{ recipientPhone: { contains: digits } }, { buyerPhone: { contains: digits } }]
        : []),
    ];
  }

  try {
    const orders = await prisma.dataOrder.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: 10000,
      include: { agent: { select: { storeName: true, code: true } } },
    });

    const sheet: Sheet = {
      name: "Bundle orders",
      columns: [
        "Order ID",
        "Source",
        "Network",
        "Size",
        "Recipient phone",
        "Buyer phone",
        "Buyer name",
        "Price",
        "Cost",
        "Commission",
        "Commission status",
        "Payment",
        "Status",
        "Provider status",
        "Date",
      ],
      rows: orders.map((o) => [
        o.reference,
        orderSourceLabel({
          source: o.source,
          agentName: o.agent?.storeName ?? null,
          agentCode: o.agent?.code ?? null,
        }),
        networkLabel(o.network),
        bundleLabel(o.sizeGb),
        o.recipientPhone,
        o.buyerPhone,
        o.buyerName ?? "",
        o.price,
        o.costPrice,
        o.agentCommission,
        o.commissionStatus,
        o.paymentStatus === "paid" ? "Payment success" : "Payment pending",
        isDataOrderStatus(o.status) ? DATA_STATUS_LABELS[o.status] : o.status,
        o.providerStatus ?? "",
        o.createdAt,
      ]),
    };

    return workbookResponse([sheet], "bundle-orders");
  } catch (error) {
    console.error("[admin orders export] failed", error);
    return NextResponse.json({ error: "Could not build the export." }, { status: 500 });
  }
}
