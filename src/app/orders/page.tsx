import Link from "next/link";
import type { Metadata } from "next";
import { CheckCircle2, ClipboardList, MapPin, Truck, XCircle } from "lucide-react";
import { Container } from "@/components/ui/Container";
import { PageHeader } from "@/components/ui/PageHeader";
import { EmptyState } from "@/components/ui/EmptyState";
import { ClearCartOnSuccess } from "@/components/cart/ClearCartOnSuccess";
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

export default async function OrdersPage({
  searchParams,
}: {
  searchParams: Promise<{ placed?: string; failed?: string }>;
}) {
  const user = await requireUser();
  const { placed, failed } = await searchParams;

  const include = {
    items: { include: { product: true } },
    shipment: true,
    pickupPoint: true,
  } as const;

  const orders = await prisma.order.findMany({
    where: { userId: user.id },
    orderBy: { createdAt: "desc" },
    include,
  });

  return (
    <>
      <PageHeader title="My Orders" crumbs={[{ label: "Orders" }]} />
      <Container className="py-8">
        <ClearCartOnSuccess active={Boolean(placed)} />
        {placed ? (
          <div className="mb-6 flex items-center gap-3 rounded-2xl bg-niki-success/10 p-4 text-sm font-medium text-niki-success ring-1 ring-niki-success/20">
            <CheckCircle2 className="h-5 w-5 shrink-0" />
            Order <span className="font-bold">{placed}</span> placed successfully — thank you! Track it below.
          </div>
        ) : null}
        {failed ? (
          <div className="mb-6 flex items-center gap-3 rounded-2xl bg-niki-danger/10 p-4 text-sm font-medium text-niki-danger ring-1 ring-niki-danger/20">
            <XCircle className="h-5 w-5 shrink-0" />
            <span>
              Payment for order <span className="font-bold">{failed}</span> wasn&apos;t completed. It&apos;s
              saved as pending — you can{" "}
              <Link href="/cart" className="underline hover:no-underline">
                return to your cart
              </Link>{" "}
              and try again.
            </span>
          </div>
        ) : null}
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
                  <div className="flex items-center gap-4">
                    <span className="font-display font-bold text-niki-ink">
                      Total {formatPrice(order.total)}
                    </span>
                    <Link
                      href={`/orders/${order.orderNumber}`}
                      className="rounded-full bg-niki-navy px-4 py-2 text-xs font-semibold text-white transition-colors hover:bg-niki-navy-light"
                    >
                      Track order
                    </Link>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </Container>
    </>
  );
}
