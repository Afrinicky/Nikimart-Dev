import Link from "next/link";
import type { Metadata } from "next";
import { ArrowLeft, Mail, MapPin, MessageCircle, Phone, Truck } from "lucide-react";
import { Container } from "@/components/ui/Container";
import { PageHeader } from "@/components/ui/PageHeader";
import { requireDashboard } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { getSellerVendor } from "@/lib/seller";
import { formatPrice } from "@/lib/format";
import { ORDER_STATUS_LABELS, SHIPMENT_STATUS_LABELS, statusTone } from "@/lib/order-status";

export const metadata: Metadata = { title: "Orders — Seller — NikiMart" };

/** Ghana-friendly WhatsApp deep link (digits only, local 0 → 233). */
function waLink(phone?: string | null): string | null {
  if (!phone) return null;
  let d = phone.replace(/\D/g, "");
  if (d.startsWith("0")) d = "233" + d.slice(1);
  else if (!d.startsWith("233") && d.length === 9) d = "233" + d;
  return d.length >= 11 ? `https://wa.me/${d}` : null;
}

export default async function SellerOrdersPage() {
  const user = await requireDashboard("/seller");
  const vendor = await getSellerVendor(user.id);

  if (!vendor) {
    return (
      <>
        <PageHeader title="Orders" crumbs={[{ label: "Seller", href: "/seller" }, { label: "Orders" }]} />
        <Container className="py-8">
          <div className="rounded-2xl bg-niki-navy p-6 text-sm text-white/80">
            Register your shop first to receive orders.{" "}
            <Link href="/vendor-register" className="font-semibold text-niki-orange hover:underline">Register a shop</Link>
          </div>
        </Container>
      </>
    );
  }

  const orders = await prisma.order.findMany({
    where: { items: { some: { product: { vendorId: vendor.id } } }, status: { not: "pending" } },
    orderBy: { createdAt: "desc" },
    include: {
      user: { select: { name: true, phone: true, email: true } },
      shipment: { select: { status: true, trackingNumber: true } },
      pickupPoint: { select: { name: true } },
      items: {
        where: { product: { vendorId: vendor.id } },
        include: { product: { select: { name: true, emoji: true } } },
      },
    },
  });

  return (
    <>
      <PageHeader
        title="Orders"
        subtitle="Orders containing your products. Contact the buyer while the item is in transit."
        crumbs={[{ label: "Seller", href: "/seller" }, { label: "Orders" }]}
      >
        <Link href="/seller" className="flex items-center gap-2 rounded-full px-4 py-2 text-sm font-semibold text-niki-ink/70 ring-1 ring-black/10 hover:bg-white">
          <ArrowLeft className="h-4 w-4" />
          Dashboard
        </Link>
      </PageHeader>

      <Container className="py-8">
        {orders.length === 0 ? (
          <p className="rounded-2xl bg-white p-8 text-center text-sm text-niki-ink/60 ring-1 ring-black/5">
            No orders yet. When a customer buys one of your products, it&apos;ll appear here.
          </p>
        ) : (
          <div className="space-y-4">
            {orders.map((order) => {
              const vendorSubtotal = order.items.reduce((s, i) => s + i.unitPrice * i.quantity, 0);
              const inCustody = order.status !== "delivered" && order.status !== "cancelled";
              const wa = waLink(order.user.phone);
              return (
                <div key={order.id} className="rounded-2xl bg-white ring-1 ring-black/5">
                  <div className="flex flex-wrap items-center justify-between gap-3 border-b border-black/5 p-5">
                    <div>
                      <p className="font-display font-bold text-niki-ink">Order {order.orderNumber}</p>
                      <p className="mt-0.5 text-sm text-niki-ink/60">
                        {order.createdAt.toLocaleDateString("en-GH", { day: "numeric", month: "short", year: "numeric" })}
                        {" · "}
                        {order.deliveryMethod === "pickup" ? (
                          <span className="inline-flex items-center gap-1"><MapPin className="h-3.5 w-3.5" />{order.pickupPoint?.name ?? "Pickup"}</span>
                        ) : (
                          <span className="inline-flex items-center gap-1"><Truck className="h-3.5 w-3.5" />Delivery</span>
                        )}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      {order.shipment ? (
                        <span className={`rounded-full px-3 py-1 text-xs font-semibold ${statusTone(order.shipment.status)}`}>
                          {SHIPMENT_STATUS_LABELS[order.shipment.status] ?? order.shipment.status}
                        </span>
                      ) : null}
                      <span className={`rounded-full px-3 py-1 text-xs font-semibold ${statusTone(order.status)}`}>
                        {ORDER_STATUS_LABELS[order.status] ?? order.status}
                      </span>
                    </div>
                  </div>

                  <div className="grid gap-4 p-5 sm:grid-cols-[1fr_auto]">
                    <div>
                      <ul className="space-y-1.5 text-sm">
                        {order.items.map((it) => (
                          <li key={it.id} className="flex items-center gap-2 text-niki-ink/80">
                            <span aria-hidden>{it.product.emoji}</span>
                            <span className="flex-1">{it.product.name} <span className="text-niki-ink/40">×{it.quantity}</span></span>
                            <span className="font-medium text-niki-ink">{formatPrice(it.unitPrice * it.quantity)}</span>
                          </li>
                        ))}
                      </ul>
                      <p className="mt-3 text-sm font-semibold text-niki-ink">
                        Your items total: {formatPrice(vendorSubtotal)}
                      </p>
                    </div>

                    {/* Buyer contact — shown while the order is in custody/transit. */}
                    <div className="rounded-xl bg-niki-surface p-4 sm:w-64">
                      <p className="text-xs font-semibold uppercase tracking-wide text-niki-ink/40">Buyer</p>
                      <p className="mt-1 font-medium text-niki-ink">{order.user.name ?? "Customer"}</p>
                      {inCustody ? (
                        <div className="mt-3 flex flex-wrap gap-2">
                          {wa ? (
                            <a href={wa} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1.5 rounded-full bg-niki-success/10 px-3 py-1.5 text-xs font-semibold text-niki-success">
                              <MessageCircle className="h-3.5 w-3.5" /> WhatsApp
                            </a>
                          ) : null}
                          {order.user.phone ? (
                            <a href={`tel:${order.user.phone}`} className="flex items-center gap-1.5 rounded-full bg-niki-navy/5 px-3 py-1.5 text-xs font-semibold text-niki-ink/70">
                              <Phone className="h-3.5 w-3.5" /> Call
                            </a>
                          ) : null}
                          {order.user.email ? (
                            <a href={`mailto:${order.user.email}`} className="flex items-center gap-1.5 rounded-full bg-niki-navy/5 px-3 py-1.5 text-xs font-semibold text-niki-ink/70">
                              <Mail className="h-3.5 w-3.5" /> Email
                            </a>
                          ) : null}
                          {!order.user.phone && !order.user.email ? (
                            <p className="text-xs text-niki-ink/50">No contact details on file.</p>
                          ) : null}
                        </div>
                      ) : (
                        <p className="mt-2 text-xs text-niki-ink/50">
                          {order.status === "delivered" ? "Delivered — completed." : "Order cancelled."}
                        </p>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </Container>
    </>
  );
}
