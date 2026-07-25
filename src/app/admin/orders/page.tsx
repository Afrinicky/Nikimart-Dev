import Link from "next/link";
import type { Metadata } from "next";
import { ChevronRight } from "lucide-react";
import { Container } from "@/components/ui/Container";
import { DeleteButton } from "@/components/admin/DeleteButton";
import { OrderStatusSelect } from "@/components/admin/OrderStatusSelect";
import { prisma } from "@/lib/prisma";
import { formatPrice } from "@/lib/format";
import { deleteOrder } from "@/lib/admin-actions";
import { ORDER_STATUS_LABELS } from "@/lib/order-status";

export const metadata: Metadata = { title: "Orders — Admin — NikiMart" };

export default async function AdminOrdersPage() {
  const orders = await prisma.order.findMany({
    orderBy: { createdAt: "desc" },
    include: { user: true, items: { include: { product: true } } },
  });

  return (
    <Container className="py-8">
      <div>
        <h1 className="font-display text-2xl font-bold text-niki-ink">Orders</h1>
        <p className="mt-1 text-sm text-niki-ink/60">{orders.length} orders</p>
      </div>

      <div className="mt-6 space-y-3">
        {orders.map((o) => (
          <div key={o.id} className="rounded-2xl bg-white p-5 ring-1 ring-black/5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <Link href={`/admin/orders/${o.id}`} className="group min-w-0 flex-1">
                <p className="flex items-center gap-1 font-semibold text-niki-ink group-hover:text-niki-orange">
                  {o.orderNumber}{" "}
                  <span className="font-normal text-niki-ink/50">· {o.user.name ?? o.user.email}</span>
                  <ChevronRight className="h-4 w-4 opacity-0 transition-opacity group-hover:opacity-100" />
                </p>
                <p className="mt-0.5 line-clamp-1 text-sm text-niki-ink/60">
                  {o.items.map((i) => `${i.product.name} ×${i.quantity}`).join(", ")}
                </p>
                <p className="mt-0.5 text-xs text-niki-ink/50">
                  {o.deliveryMethod} · {ORDER_STATUS_LABELS[o.status] ?? o.status} · {o.createdAt.toLocaleDateString("en-GH", { day: "numeric", month: "short", year: "numeric" })}
                </p>
              </Link>
              <div className="flex items-center gap-3">
                <span className="font-display font-bold text-niki-ink">{formatPrice(o.total)}</span>
                <OrderStatusSelect id={o.id} status={o.status} />
                <DeleteButton id={o.id} action={deleteOrder} label="" title="Delete order" />
              </div>
            </div>
          </div>
        ))}
        {orders.length === 0 ? (
          <p className="rounded-2xl bg-white p-8 text-center text-sm text-niki-ink/50 ring-1 ring-black/5">
            No orders yet.
          </p>
        ) : null}
      </div>
    </Container>
  );
}
