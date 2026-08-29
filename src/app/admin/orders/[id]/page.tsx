import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { ArrowLeft, Mail, MapPin, MessageCircle, Phone, Truck, User } from "lucide-react";
import { Container } from "@/components/ui/Container";
import { PageHeader } from "@/components/ui/PageHeader";
import { OrderStatusSelect } from "@/components/admin/OrderStatusSelect";
import { requireDashboard } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { formatPrice } from "@/lib/format";
import { ORDER_STATUS_LABELS, SHIPMENT_STATUS_LABELS, statusTone } from "@/lib/order-status";
import { normalizeGhPhone } from "@/lib/phone";

export const metadata: Metadata = { title: "Order — Admin — Nickimart" };

export default async function AdminOrderDetailPage({ params }: { params: Promise<{ id: string }> }) {
  await requireDashboard("/admin");
  const { id } = await params;

  const order = await prisma.order.findUnique({
    where: { id },
    include: {
      user: true,
      pickupPoint: true,
      shipment: { include: { freightAgent: { select: { name: true } } } },
      items: { include: { product: { include: { vendor: { select: { businessName: true } } } } } },
    },
  });
  if (!order) notFound();

  const method = order.deliveryMethod === "pickup" ? "pickup" : "delivery";
  const wa = normalizeGhPhone(order.user.phone);
  const isUnpaid = order.status === "pending";

  return (
    <>
      <PageHeader
        title={`Order ${order.orderNumber}`}
        subtitle={`Placed ${order.createdAt.toLocaleString("en-GH", { day: "numeric", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit" })}`}
        crumbs={[{ label: "Orders", href: "/admin/orders" }, { label: order.orderNumber }]}
      >
        <Link href="/admin/orders" className="flex items-center gap-2 rounded-full px-4 py-2 text-sm font-semibold text-niki-ink/70 ring-1 ring-niki-edge-strong hover:bg-white">
          <ArrowLeft className="h-4 w-4" /> Orders
        </Link>
      </PageHeader>

      <Container className="py-8">
        {isUnpaid ? (
          <div className="mb-6 rounded-2xl bg-niki-gold/15 p-4 text-sm text-niki-ink/80 ring-1 ring-niki-gold/30">
            This order is <strong>pending payment</strong> — the customer started checkout but hasn&apos;t
            completed payment. Reach out below to help them finish.
          </div>
        ) : null}

        <div className="grid gap-6 lg:grid-cols-[1fr_20rem]">
          <div className="space-y-6">
            {/* Items */}
            <div className="rounded-2xl bg-white p-6 ring-1 ring-niki-edge">
              <div className="flex items-center justify-between">
                <h2 className="font-display text-lg font-bold text-niki-ink">Items</h2>
                <span className={`rounded-full px-3 py-1 text-xs font-semibold ${statusTone(order.status)}`}>
                  {ORDER_STATUS_LABELS[order.status] ?? order.status}
                </span>
              </div>
              <table className="mt-4 w-full text-left text-sm">
                <thead className="border-b border-niki-edge text-xs uppercase tracking-wide text-niki-ink/40">
                  <tr>
                    <th className="py-2 font-semibold">Product</th>
                    <th className="py-2 font-semibold">Seller</th>
                    <th className="py-2 text-center font-semibold">Qty</th>
                    <th className="py-2 text-right font-semibold">Amount</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-niki-edge">
                  {order.items.map((it) => (
                    <tr key={it.id}>
                      <td className="py-2.5 text-niki-ink">
                        <Link href={`/admin/products/${it.productId}`} className="hover:text-niki-orange">
                          <span className="mr-1.5" aria-hidden>{it.product.emoji}</span>{it.product.name}
                        </Link>
                      </td>
                      <td className="py-2.5 text-niki-ink/60">{it.product.vendor?.businessName ?? "—"}</td>
                      <td className="py-2.5 text-center text-niki-ink/70">{it.quantity}</td>
                      <td className="py-2.5 text-right font-medium text-niki-ink">{formatPrice(it.unitPrice * it.quantity)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <dl className="mt-4 ml-auto max-w-xs space-y-1.5 text-sm">
                <div className="flex justify-between text-niki-ink/70"><dt>Subtotal</dt><dd className="font-medium text-niki-ink">{formatPrice(order.subtotal)}</dd></div>
                <div className="flex justify-between text-niki-ink/70"><dt>{method === "pickup" ? "Pickup" : "Delivery"}</dt><dd className="font-medium text-niki-ink">{order.deliveryFee === 0 ? "Free" : formatPrice(order.deliveryFee)}</dd></div>
                <div className="flex justify-between border-t border-niki-edge-strong pt-2 text-base font-bold text-niki-ink"><dt>Total</dt><dd className="font-figures">{formatPrice(order.total)}</dd></div>
              </dl>
            </div>

            {/* Fulfilment */}
            <div className="rounded-2xl bg-white p-6 ring-1 ring-niki-edge">
              <h2 className="font-display text-lg font-bold text-niki-ink">Fulfilment</h2>
              <div className="mt-3 flex items-center gap-2 text-sm text-niki-ink/70">
                {method === "pickup" ? <MapPin className="h-4 w-4 text-niki-orange" /> : <Truck className="h-4 w-4 text-niki-orange" />}
                {method === "pickup"
                  ? `Pickup at ${order.pickupPoint?.name ?? "—"}${order.pickupPoint?.address ? ` — ${order.pickupPoint.address}` : ""}`
                  : `Delivery to ${order.address ?? "—"}`}
              </div>
              {order.shipment ? (
                <div className="mt-2 text-sm text-niki-ink/60">
                  Shipment {order.shipment.trackingNumber} · {SHIPMENT_STATUS_LABELS[order.shipment.status] ?? order.shipment.status}
                  {order.shipment.freightAgent?.name ? ` · Agent: ${order.shipment.freightAgent.name}` : ""}
                </div>
              ) : null}
            </div>
          </div>

          {/* Customer */}
          <aside className="h-fit space-y-4">
            <div className="rounded-2xl bg-white p-6 ring-1 ring-niki-edge">
              <div className="flex items-center gap-2 text-niki-ink">
                <User className="h-5 w-5 text-niki-orange" />
                <h2 className="font-display font-bold">Customer</h2>
              </div>
              <p className="mt-3 font-semibold text-niki-ink">{order.user.name ?? "Customer"}</p>
              {order.user.email ? <p className="text-sm text-niki-ink/60">{order.user.email}</p> : null}
              {order.user.phone ? <p className="text-sm text-niki-ink/60">{order.user.phone}</p> : null}
              {order.user.address ? <p className="mt-2 text-sm text-niki-ink/60">{order.user.address}</p> : null}

              <div className="mt-4 flex flex-wrap gap-2">
                {wa ? (
                  <a href={`https://wa.me/${wa}`} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1.5 rounded-full bg-niki-success/10 px-3 py-1.5 text-xs font-semibold text-niki-success">
                    <MessageCircle className="h-3.5 w-3.5" /> WhatsApp
                  </a>
                ) : null}
                {order.user.phone ? (
                  <a href={`tel:${order.user.phone}`} className="flex items-center gap-1.5 rounded-full bg-niki-navy/5 px-3 py-1.5 text-xs font-semibold text-niki-ink/70"><Phone className="h-3.5 w-3.5" /> Call</a>
                ) : null}
                {order.user.email ? (
                  <a href={`mailto:${order.user.email}`} className="flex items-center gap-1.5 rounded-full bg-niki-navy/5 px-3 py-1.5 text-xs font-semibold text-niki-ink/70"><Mail className="h-3.5 w-3.5" /> Email</a>
                ) : null}
              </div>
            </div>

            <div className="rounded-2xl bg-white p-6 ring-1 ring-niki-edge">
              <h2 className="font-display font-bold text-niki-ink">Update status</h2>
              <p className="mt-1 mb-3 text-xs text-niki-ink/50">Admin override — syncs the tracking timeline.</p>
              <OrderStatusSelect id={order.id} status={order.status} />
            </div>
          </aside>
        </div>
      </Container>
    </>
  );
}
