import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { ArrowLeft, MapPin, Package, Truck } from "lucide-react";
import { Container } from "@/components/ui/Container";
import { PageHeader } from "@/components/ui/PageHeader";
import { TrackingTimeline } from "@/components/order/TrackingTimeline";
import { requireUser } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { formatPrice } from "@/lib/format";
import { ORDER_STATUS_LABELS, statusTone } from "@/lib/order-status";
import type { ShipmentTimestamps } from "@/lib/tracking";

export const metadata: Metadata = { title: "Track Order — NikiMart" };

type Params = Promise<{ orderNumber: string }>;

export default async function OrderTrackingPage({ params }: { params: Params }) {
  const user = await requireUser();
  const { orderNumber } = await params;

  const order = await prisma.order.findFirst({
    where: { orderNumber, userId: user.id },
    include: { items: { include: { product: true } }, shipment: true, pickupPoint: true },
  });
  if (!order) notFound();

  const method = order.deliveryMethod === "pickup" ? "pickup" : "delivery";
  const timestamps: ShipmentTimestamps = {
    processingAt: order.shipment?.processingAt ?? null,
    transitAt: order.shipment?.transitAt ?? null,
    outForDeliveryAt: order.shipment?.outForDeliveryAt ?? null,
    deliveredAt: order.shipment?.deliveredAt ?? null,
  };

  return (
    <>
      <PageHeader title={`Order ${order.orderNumber}`} crumbs={[{ label: "Orders", href: "/orders" }, { label: order.orderNumber }]} />
      <Container className="py-8">
        <Link href="/orders" className="flex items-center gap-1 text-sm text-niki-ink/60 hover:text-niki-ink">
          <ArrowLeft className="h-4 w-4" />
          Back to my orders
        </Link>

        <div className="mt-4 grid gap-6 lg:grid-cols-[1fr_20rem]">
          <div className="rounded-2xl bg-white p-6 ring-1 ring-black/5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 className="font-display text-lg font-bold text-niki-ink">Tracking</h2>
              <span className={`rounded-full px-3 py-1 text-xs font-semibold ${statusTone(order.status)}`}>
                {ORDER_STATUS_LABELS[order.status] ?? order.status}
              </span>
            </div>

            <div className="mt-3 flex items-center gap-2 text-sm text-niki-ink/60">
              {method === "pickup" ? <MapPin className="h-4 w-4 text-niki-orange" /> : <Truck className="h-4 w-4 text-niki-orange" />}
              {method === "pickup"
                ? `Pickup at ${order.pickupPoint?.name ?? "pickup point"}`
                : `Delivery to ${order.address ?? "your address"}`}
              {order.shipment ? <span className="text-niki-ink/40">· {order.shipment.trackingNumber}</span> : null}
            </div>

            <div className="mt-6">
              <TrackingTimeline timestamps={timestamps} method={method} />
            </div>
          </div>

          <aside className="h-fit rounded-2xl bg-white p-6 ring-1 ring-black/5">
            <h2 className="font-display text-lg font-bold text-niki-ink">Order</h2>
            <div className="mt-4 divide-y divide-black/5">
              {order.items.map((item) => (
                <div key={item.id} className="flex items-center gap-3 py-2">
                  <span className="text-xl" aria-hidden>{item.product.emoji}</span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-niki-ink">{item.product.name}</p>
                    <p className="text-xs text-niki-ink/60">Qty {item.quantity}</p>
                  </div>
                  <span className="text-sm font-medium text-niki-ink/80">{formatPrice(item.unitPrice * item.quantity)}</span>
                </div>
              ))}
            </div>
            <div className="mt-4 flex justify-between border-t border-black/5 pt-4 font-display font-bold text-niki-ink">
              <span>Total</span>
              <span>{formatPrice(order.total)}</span>
            </div>
            <p className="mt-3 flex items-center gap-1.5 text-xs text-niki-ink/50">
              <Package className="h-3.5 w-3.5" />
              Placed {order.createdAt.toLocaleDateString("en-GH", { day: "numeric", month: "short", year: "numeric" })}
            </p>
          </aside>
        </div>
      </Container>
    </>
  );
}
