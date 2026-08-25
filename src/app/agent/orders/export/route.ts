import { NextResponse } from "next/server";
import { requireUser } from "@/lib/session";
import { getAgentForUser } from "@/lib/data-bundles/agents";
import { prisma } from "@/lib/prisma";
import {
  DATA_STATUS_LABELS,
  bundleLabel,
  isDataOrderStatus,
  networkLabel,
} from "@/lib/data-bundles/networks";
import { workbookResponse, type Sheet } from "@/lib/xlsx";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const sourceLabel = (s: string) =>
  s === "STOREFRONT" ? "Storefront" : s === "AGENT" ? "Dashboard" : "Web";

/**
 * Excel export of the signed-in agent's bundle orders, honouring the same
 * status filter as the Orders table. Scoped to the agent, so it can only ever
 * contain their own sales.
 */
export async function GET(req: Request) {
  let agentId: string;
  try {
    const user = await requireUser();
    const agent = await getAgentForUser(user.id);
    if (!agent) return NextResponse.json({ error: "Not an agent" }, { status: 403 });
    agentId = agent.id;
  } catch {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const status = new URL(req.url).searchParams.get("status") ?? "all";
  const where = {
    agentId,
    ...(status !== "all" && isDataOrderStatus(status) ? { status } : {}),
  };

  try {
    const orders = await prisma.dataOrder.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: 5000,
    });

    const sheet: Sheet = {
      name: "Orders",
      columns: [
        "Order ID",
        "Network",
        "Size",
        "Phone",
        "Price",
        "Commission",
        "Commission status",
        "Payment",
        "Status",
        "Source",
        "Date",
      ],
      rows: orders.map((o) => [
        o.reference,
        networkLabel(o.network),
        bundleLabel(o.sizeGb),
        o.recipientPhone,
        o.price,
        o.agentCommission,
        o.commissionStatus,
        o.paymentStatus === "paid" ? "Payment success" : "Payment pending",
        isDataOrderStatus(o.status) ? DATA_STATUS_LABELS[o.status] : o.status,
        sourceLabel(o.source),
        o.createdAt,
      ]),
    };

    return workbookResponse([sheet], "bundle-orders");
  } catch (error) {
    console.error("[agent orders export] failed", error);
    return NextResponse.json({ error: "Could not build the export." }, { status: 500 });
  }
}
