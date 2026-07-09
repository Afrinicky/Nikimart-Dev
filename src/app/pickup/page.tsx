import type { Metadata } from "next";
import { MapPin, PackageCheck } from "lucide-react";
import { Container } from "@/components/ui/Container";
import { PageHeader } from "@/components/ui/PageHeader";
import { StatCard } from "@/components/dashboard/StatCard";
import { LogoutButton } from "@/components/auth/LogoutButton";
import { requireDashboard } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { formatPrice } from "@/lib/format";
import { ORDER_STATUS_LABELS, statusTone } from "@/lib/order-status";
import { markCollectedAction } from "@/lib/dashboard-actions";

export const metadata: Metadata = {
  title: "Pickup Dashboard — NikiMart",
};

export default async function PickupDashboardPage() {
  const user = await requireDashboard("/pickup");

  // A pickup operator manages one point; admins see all points.
  const pickupPoints = await prisma.pickupPoint.findMany({
    where: user.role === "ADMIN" ? {} : { operatorId: user.id },
    include: {
      orders: {
        where: { deliveryMethod: "pickup" },
        include: { user: true, items: true },
        orderBy: { createdAt: "desc" },
      },
    },
  });

  const allOrders = pickupPoints.flatMap((p) => p.orders);
  const awaiting = allOrders.filter((o) => o.status !== "delivered" && o.status !== "cancelled");
  const collected = allOrders.filter((o) => o.status === "delivered");

  return (
    <>
      <PageHeader
        title="Pickup Dashboard"
        subtitle="Manage orders routed to your pickup point."
        crumbs={[{ label: "Pickup" }]}
      >
        <div className="flex flex-wrap items-center gap-2">
          <span className="flex items-center gap-2 rounded-full bg-niki-navy px-4 py-2 text-sm font-medium text-white">
            <MapPin className="h-4 w-4 text-niki-orange" />
            {user.name}
          </span>
          <LogoutButton />
        </div>
      </PageHeader>

      <Container className="py-8">
        {pickupPoints.length === 0 ? (
          <p className="rounded-2xl bg-white p-6 text-sm text-niki-ink/60 ring-1 ring-black/5">
            You are not assigned to a pickup point yet. Ask an administrator to link your account.
          </p>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
              <StatCard label="Pickup points" value={pickupPoints.length} />
              <StatCard label="Total orders" value={allOrders.length} />
              <StatCard label="Awaiting collection" value={awaiting.length} />
              <StatCard label="Collected" value={collected.length} />
            </div>

            {pickupPoints.map((point) => (
              <section key={point.id} className="mt-8">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <h2 className="font-display text-lg font-bold text-niki-ink">{point.name}</h2>
                    <p className="text-sm text-niki-ink/60">
                      {point.address} · Code{" "}
                      <span className="font-semibold text-niki-ink/80">{point.code}</span>
                    </p>
                  </div>
                  <span
                    className={`rounded-full px-3 py-1 text-xs font-semibold ${
                      point.isActive ? "bg-niki-success/10 text-niki-success" : "bg-niki-ink/10 text-niki-ink/60"
                    }`}
                  >
                    {point.isActive ? "Active" : "Inactive"}
                  </span>
                </div>

                {point.orders.length === 0 ? (
                  <p className="mt-4 rounded-2xl bg-white p-6 text-sm text-niki-ink/60 ring-1 ring-black/5">
                    No orders routed here yet.
                  </p>
                ) : (
                  <div className="mt-4 space-y-3">
                    {point.orders.map((order) => (
                      <div
                        key={order.id}
                        className="flex flex-wrap items-center justify-between gap-4 rounded-2xl bg-white p-5 ring-1 ring-black/5"
                      >
                        <div>
                          <p className="font-semibold text-niki-ink">Order {order.orderNumber}</p>
                          <p className="mt-0.5 text-sm text-niki-ink/60">
                            {order.user.name ?? order.user.email} ·{" "}
                            {order.items.length} item{order.items.length === 1 ? "" : "s"} ·{" "}
                            {formatPrice(order.total)}
                          </p>
                        </div>
                        <div className="flex items-center gap-3">
                          <span
                            className={`rounded-full px-3 py-1 text-xs font-semibold ${statusTone(order.status)}`}
                          >
                            {ORDER_STATUS_LABELS[order.status] ?? order.status}
                          </span>
                          {order.status !== "delivered" && order.status !== "cancelled" ? (
                            <form action={markCollectedAction}>
                              <input type="hidden" name="orderId" value={order.id} />
                              <button
                                type="submit"
                                className="flex items-center gap-1.5 rounded-full bg-niki-navy px-4 py-2 text-xs font-semibold text-white transition-colors hover:bg-niki-navy-light"
                              >
                                <PackageCheck className="h-4 w-4" />
                                Mark collected
                              </button>
                            </form>
                          ) : null}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </section>
            ))}
          </>
        )}
      </Container>
    </>
  );
}
