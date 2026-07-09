import type { Metadata } from "next";
import { ClipboardList, MapPin, Truck } from "lucide-react";
import { Container } from "@/components/ui/Container";
import { PageHeader } from "@/components/ui/PageHeader";
import { EmptyState } from "@/components/ui/EmptyState";
import { requireUser } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { formatPrice } from "@/lib/format";
import {
  ORDER_STATUS_LABELS,
  SHIPMENT_STATUS_LABELS,
  statusTone,
} from "@/lib/order-status";

export const metadata: Metadata = {
  title: "My Orders — NikiMart",
};

export default async function OrdersPage() {
  const user = await requireUser();

  const orders = await prisma.order.findMany({
    where: { userId: user.id },
    orderBy: { createdAt: "desc" },
    include: {
      items: { include: { product: true } },
      shipment: true,
      pickupPoint: true,
    },
  });

  return (
    <>
      <PageHeader title="My Orders" crumbs={[{ label: "Orders" }]} />
      <Container className="py-8">
        {orders.length === 0 ? (
          <EmptyState
            icon={<ClipboardList className="h-6 w-6" />}
            title="No orders yet"
            message="When you place an order, it'll show up here so you can track delivery or pickup."
            actionLabel="Start shopping"
            actionHref="/products"
          />
        ) : (
          <div className="space-y-4">
            {orders.map((order) => (
              <div key={order.id} className="rounded-2xl bg-white ring-1 ring-black/5">
                <div className="flex flex-wrap items-center justify-between gap-3 border-b border-black/5 p-5">
                  <div>
                    <p className="font-display font-bold text-niki-ink">Order {order.orderNumber}</p>
                    <p className="mt-0.5 text-sm text-niki-ink/60">
                      Placed{" "}
                      {order.createdAt.toLocaleDateString("en-GH", {
                        day: "numeric",
                        month: "short",
                        year: "numeric",
                      })}
                    </p>
                  </div>
                  <span
                    className={`rounded-full px-3 py-1 text-xs font-semibold ${statusTone(order.status)}`}
                  >
                    {ORDER_STATUS_LABELS[order.status] ?? order.status}
                  </span>
                </div>

                <div className="divide-y divide-black/5">
                  {order.items.map((item) => (
                    <div key={item.id} className="flex items-center gap-3 px-5 py-3">
                      <span className="text-xl" aria-hidden>
                        {item.product.emoji}
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium text-niki-ink">
                          {item.product.name}
                        </p>
                        <p className="text-xs text-niki-ink/60">Qty {item.quantity}</p>
                      </div>
                      <span className="text-sm font-medium text-niki-ink/80">
                        {formatPrice(item.unitPrice * item.quantity)}
                      </span>
                    </div>
                  ))}
                </div>

                <div className="flex flex-wrap items-center justify-between gap-3 border-t border-black/5 p-5">
                  <div className="flex items-center gap-2 text-sm text-niki-ink/70">
                    {order.deliveryMethod === "pickup" ? (
                      <>
                        <MapPin className="h-4 w-4 text-niki-orange" />
                        {order.pickupPoint ? `Pickup at ${order.pickupPoint.name}` : "Pickup"}
                      </>
                    ) : (
                      <>
                        <Truck className="h-4 w-4 text-niki-orange" />
                        {order.shipment
                          ? `${SHIPMENT_STATUS_LABELS[order.shipment.status] ?? order.shipment.status} · ${order.shipment.trackingNumber}`
                          : "Delivery"}
                      </>
                    )}
                  </div>
                  <span className="font-display font-bold text-niki-ink">
                    Total {formatPrice(order.total)}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </Container>
    </>
  );
}
