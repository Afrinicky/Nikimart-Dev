import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { ArrowLeft, CheckCircle2, MapPin, Truck } from "lucide-react";
import { Container } from "@/components/ui/Container";
import { PrintButton } from "@/components/order/PrintButton";
import { requireUser } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { getSettings } from "@/lib/settings";
import { formatPrice } from "@/lib/format";
import { ORDER_STATUS_LABELS } from "@/lib/order-status";

export const metadata: Metadata = { title: "Receipt — NikiMart" };

type Params = Promise<{ orderNumber: string }>;

export default async function ReceiptPage({ params }: { params: Params }) {
  const user = await requireUser();
  const { orderNumber } = await params;

  const [order, settings] = await Promise.all([
    prisma.order.findFirst({
      where: { orderNumber, userId: user.id },
      include: { items: { include: { product: true } }, shipment: true, pickupPoint: true, user: true },
    }),
    getSettings(),
  ]);
  if (!order) notFound();

  const isPaid = order.status !== "pending" && order.status !== "cancelled";
  const method = order.deliveryMethod === "pickup" ? "pickup" : "delivery";

  return (
    <Container className="py-8">
      <div className="no-print mb-4 flex flex-wrap items-center justify-between gap-3">
        <Link href={`/orders/${order.orderNumber}`} className="flex items-center gap-1 text-sm text-niki-ink/60 hover:text-niki-ink">
          <ArrowLeft className="h-4 w-4" /> Back to order
        </Link>
        <PrintButton />
      </div>

      {/* Receipt sheet */}
      <div className="receipt-sheet mx-auto max-w-2xl rounded-2xl bg-white p-8 ring-1 ring-black/5 print:ring-0">
        <div className="flex items-start justify-between gap-4 border-b border-black/10 pb-5">
          <div>
            <div className="font-display text-2xl font-bold text-niki-ink">
              Niki<span className="text-niki-orange">Mart</span>
            </div>
            <p className="mt-1 text-xs text-niki-ink/50">{settings.footerTagline}</p>
            <p className="mt-2 text-xs text-niki-ink/50">
              {settings.supportEmail} · {settings.supportPhone}
            </p>
          </div>
          <div className="text-right">
            <p className="font-display text-lg font-bold text-niki-ink">Receipt</p>
            <p className="mt-1 text-sm font-semibold text-niki-ink">{order.orderNumber}</p>
            <span
              className={`mt-2 inline-flex items-center gap-1 rounded-full px-3 py-1 text-xs font-bold ${
                isPaid ? "bg-niki-success/10 text-niki-success" : "bg-niki-ink/10 text-niki-ink/60"
              }`}
            >
              {isPaid ? <CheckCircle2 className="h-3.5 w-3.5" /> : null}
              {ORDER_STATUS_LABELS[order.status] ?? order.status}
            </span>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4 py-5 text-sm">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-niki-ink/40">Billed to</p>
            <p className="mt-1 font-medium text-niki-ink">{order.user.name ?? "Customer"}</p>
            {order.user.email ? <p className="text-niki-ink/60">{order.user.email}</p> : null}
            {order.user.phone ? <p className="text-niki-ink/60">{order.user.phone}</p> : null}
          </div>
          <div className="text-right">
            <p className="text-xs font-semibold uppercase tracking-wide text-niki-ink/40">Order date</p>
            <p className="mt-1 font-medium text-niki-ink">
              {order.createdAt.toLocaleString("en-GH", { day: "numeric", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit" })}
            </p>
            <p className="mt-2 flex items-center justify-end gap-1 text-xs text-niki-ink/60">
              {method === "pickup" ? <MapPin className="h-3.5 w-3.5" /> : <Truck className="h-3.5 w-3.5" />}
              {method === "pickup" ? (order.pickupPoint?.name ?? "Pickup") : "Delivery"}
            </p>
          </div>
        </div>

        {/* Delivery / pickup destination */}
        <div className="mb-5 rounded-xl bg-niki-surface p-4 text-sm">
          <p className="text-xs font-semibold uppercase tracking-wide text-niki-ink/40">
            {method === "pickup" ? "Collect from" : "Deliver to"}
          </p>
          <p className="mt-1 text-niki-ink/80">
            {method === "pickup"
              ? `${order.pickupPoint?.name ?? "Pickup point"}${order.pickupPoint?.address ? ` — ${order.pickupPoint.address}` : ""}`
              : (order.address ?? "—")}
          </p>
          {order.shipment ? (
            <p className="mt-1 text-xs text-niki-ink/50">Tracking: {order.shipment.trackingNumber}</p>
          ) : null}
        </div>

        {/* Items */}
        <table className="w-full text-left text-sm">
          <thead className="border-b border-black/10 text-xs uppercase tracking-wide text-niki-ink/40">
            <tr>
              <th className="py-2 font-semibold">Item</th>
              <th className="py-2 text-center font-semibold">Qty</th>
              <th className="py-2 text-right font-semibold">Unit</th>
              <th className="py-2 text-right font-semibold">Amount</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-black/5">
            {order.items.map((it) => (
              <tr key={it.id}>
                <td className="py-2.5 text-niki-ink">
                  <span className="mr-1.5" aria-hidden>{it.product.emoji}</span>
                  {it.product.name}
                </td>
                <td className="py-2.5 text-center text-niki-ink/70">{it.quantity}</td>
                <td className="py-2.5 text-right text-niki-ink/70">{formatPrice(it.unitPrice)}</td>
                <td className="py-2.5 text-right font-medium text-niki-ink">{formatPrice(it.unitPrice * it.quantity)}</td>
              </tr>
            ))}
          </tbody>
        </table>

        {/* Totals */}
        <div className="mt-4 ml-auto max-w-xs space-y-1.5 text-sm">
          <div className="flex justify-between text-niki-ink/70">
            <span>Subtotal</span>
            <span className="font-medium text-niki-ink">{formatPrice(order.subtotal)}</span>
          </div>
          <div className="flex justify-between text-niki-ink/70">
            <span>{method === "pickup" ? "Pickup" : "Delivery"}</span>
            <span className="font-medium text-niki-ink">{order.deliveryFee === 0 ? "Free" : formatPrice(order.deliveryFee)}</span>
          </div>
          <div className="flex justify-between border-t border-black/10 pt-2 text-base font-bold text-niki-ink">
            <span>Total</span>
            <span className="font-display">{formatPrice(order.total)}</span>
          </div>
        </div>

        <div className="mt-8 border-t border-black/10 pt-5 text-center text-xs text-niki-ink/50">
          <p>Thank you for shopping with NikiMart. This receipt was generated on {new Date().toLocaleDateString("en-GH", { day: "numeric", month: "short", year: "numeric" })}.</p>
          <p className="mt-1">{settings.restrictionsText}</p>
        </div>
      </div>
    </Container>
  );
}
