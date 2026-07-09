import type { Metadata } from "next";
import { Truck } from "lucide-react";
import { Container } from "@/components/ui/Container";
import { PageHeader } from "@/components/ui/PageHeader";
import { StatCard } from "@/components/dashboard/StatCard";
import { LogoutButton } from "@/components/auth/LogoutButton";
import { requireDashboard } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { SHIPMENT_STATUS_LABELS, statusTone } from "@/lib/order-status";
import { advanceShipmentAction } from "@/lib/dashboard-actions";

export const metadata: Metadata = {
  title: "Freight Dashboard — NikiMart",
};

export default async function FreightDashboardPage() {
  const user = await requireDashboard("/freight");

  // Admins see everything; freight agents see their own consignments.
  const where = user.role === "ADMIN" ? {} : { freightAgentId: user.id };
  const shipments = await prisma.shipment.findMany({
    where,
    include: { order: { include: { user: true } } },
    orderBy: { createdAt: "desc" },
  });

  const inTransit = shipments.filter(
    (s) => s.status === "in_transit" || s.status === "out_for_delivery",
  ).length;
  const delivered = shipments.filter((s) => s.status === "delivered").length;
  const processing = shipments.filter((s) => s.status === "processing").length;

  return (
    <>
      <PageHeader
        title="Freight Dashboard"
        subtitle="Track and move consignments through delivery."
        crumbs={[{ label: "Freight" }]}
      >
        <div className="flex flex-wrap items-center gap-2">
          <span className="flex items-center gap-2 rounded-full bg-niki-navy px-4 py-2 text-sm font-medium text-white">
            <Truck className="h-4 w-4 text-niki-orange" />
            {user.name}
          </span>
          <LogoutButton />
        </div>
      </PageHeader>

      <Container className="py-8">
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          <StatCard label="Total consignments" value={shipments.length} />
          <StatCard label="Processing" value={processing} />
          <StatCard label="In transit" value={inTransit} />
          <StatCard label="Delivered" value={delivered} />
        </div>

        <h2 className="mt-8 font-display text-lg font-bold text-niki-ink">Consignments</h2>
        {shipments.length === 0 ? (
          <p className="mt-4 rounded-2xl bg-white p-6 text-sm text-niki-ink/60 ring-1 ring-black/5">
            No consignments assigned to you yet.
          </p>
        ) : (
          <div className="mt-4 space-y-3">
            {shipments.map((s) => (
              <div
                key={s.id}
                className="flex flex-wrap items-center justify-between gap-4 rounded-2xl bg-white p-5 ring-1 ring-black/5"
              >
                <div className="min-w-0">
                  <p className="font-semibold text-niki-ink">
                    {s.trackingNumber}{" "}
                    <span className="font-normal text-niki-ink/50">· {s.order.orderNumber}</span>
                  </p>
                  <p className="mt-0.5 truncate text-sm text-niki-ink/60">
                    {s.origin} → {s.destination}
                  </p>
                  {s.eta ? (
                    <p className="mt-0.5 text-xs text-niki-ink/50">
                      ETA {s.eta.toLocaleDateString("en-GH", { day: "numeric", month: "short" })}
                    </p>
                  ) : null}
                </div>
                <div className="flex items-center gap-3">
                  <span
                    className={`rounded-full px-3 py-1 text-xs font-semibold ${statusTone(s.status)}`}
                  >
                    {SHIPMENT_STATUS_LABELS[s.status] ?? s.status}
                  </span>
                  {s.status !== "delivered" ? (
                    <form action={advanceShipmentAction}>
                      <input type="hidden" name="shipmentId" value={s.id} />
                      <button
                        type="submit"
                        className="rounded-full bg-niki-navy px-4 py-2 text-xs font-semibold text-white transition-colors hover:bg-niki-navy-light"
                      >
                        Advance status
                      </button>
                    </form>
                  ) : null}
                </div>
              </div>
            ))}
          </div>
        )}
      </Container>
    </>
  );
}
