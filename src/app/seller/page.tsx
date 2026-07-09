import Link from "next/link";
import type { Metadata } from "next";
import { BadgeCheck, Boxes, ClipboardList, Plus, Settings, Wallet } from "lucide-react";
import { Container } from "@/components/ui/Container";
import { PageHeader } from "@/components/ui/PageHeader";
import { StatCard } from "@/components/dashboard/StatCard";
import { LogoutButton } from "@/components/auth/LogoutButton";
import { requireDashboard } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { formatPrice } from "@/lib/format";
import { ORDER_STATUS_LABELS, statusTone } from "@/lib/order-status";

export const metadata: Metadata = {
  title: "Seller Dashboard — NikiMart",
};

const ACTIONS = [
  { icon: Plus, title: "Add a product", desc: "List a new product, preorder, or service.", href: "/vendor-register" },
  { icon: Boxes, title: "Manage products", desc: "Edit, restock, or remove your listings.", href: "/seller" },
  { icon: ClipboardList, title: "Orders", desc: "View and fulfil incoming orders.", href: "/seller" },
  { icon: Wallet, title: "Settlements", desc: "Track your payouts and earnings.", href: "/seller" },
  { icon: Settings, title: "Shop settings", desc: "Update your shop profile and delivery options.", href: "/seller" },
];

export default async function SellerDashboardPage() {
  const user = await requireDashboard("/seller");

  const vendor = await prisma.vendor.findFirst({
    where: { ownerId: user.id },
    include: {
      products: { orderBy: { name: "asc" } },
    },
  });

  // Orders that include at least one of this vendor's products.
  const orderItems = vendor
    ? await prisma.orderItem.findMany({
        where: { product: { vendorId: vendor.id } },
        include: { order: true, product: true },
        orderBy: { order: { createdAt: "desc" } },
      })
    : [];

  const productCount = vendor?.products.length ?? 0;
  const openOrders = new Set(
    orderItems.filter((i) => i.order.status !== "delivered" && i.order.status !== "cancelled").map((i) => i.orderId),
  ).size;
  const grossSales = orderItems
    .filter((i) => i.order.status !== "cancelled")
    .reduce((sum, i) => sum + i.unitPrice * i.quantity, 0);
  const pendingPayout = orderItems
    .filter((i) => i.order.status === "paid" || i.order.status === "shipped")
    .reduce((sum, i) => sum + i.unitPrice * i.quantity, 0);

  // Latest orders (deduped) for the fulfilment list.
  const seenOrders = new Set<string>();
  const recentOrders = orderItems
    .filter((i) => {
      if (seenOrders.has(i.orderId)) return false;
      seenOrders.add(i.orderId);
      return true;
    })
    .slice(0, 6);

  return (
    <>
      <PageHeader
        title="Seller Dashboard"
        subtitle={
          vendor
            ? `Managing ${vendor.businessName}.`
            : "Manage your shop, products, orders, and payouts."
        }
        crumbs={[{ label: "Seller" }]}
      >
        <div className="flex flex-wrap items-center gap-2">
          <Link
            href="/vendor-register"
            className="flex items-center gap-2 rounded-full bg-niki-orange px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-niki-orange-light"
          >
            <Plus className="h-4 w-4" />
            Add product
          </Link>
          <LogoutButton />
        </div>
      </PageHeader>

      <Container className="py-8">
        {!vendor ? (
          <div className="mb-6 flex flex-wrap items-center gap-3 rounded-2xl bg-niki-navy p-6">
            <p className="flex-1 text-sm text-white/80">
              You don&apos;t have a shop yet. Register your business to start listing products.
            </p>
            <Link
              href="/vendor-register"
              className="rounded-full bg-niki-orange px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-niki-orange-light"
            >
              Register a shop
            </Link>
          </div>
        ) : null}

        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          <StatCard label="Products listed" value={productCount} />
          <StatCard label="Open orders" value={openOrders} />
          <StatCard label="Gross sales" value={formatPrice(grossSales)} />
          <StatCard label="Payouts pending" value={formatPrice(pendingPayout)} />
        </div>

        {vendor ? (
          <>
            <h2 className="mt-8 font-display text-lg font-bold text-niki-ink">Incoming orders</h2>
            {recentOrders.length === 0 ? (
              <p className="mt-4 rounded-2xl bg-white p-6 text-sm text-niki-ink/60 ring-1 ring-black/5">
                No orders yet. Your incoming orders will show up here.
              </p>
            ) : (
              <div className="mt-4 space-y-3">
                {recentOrders.map((item) => (
                  <div
                    key={item.orderId}
                    className="flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-white p-5 ring-1 ring-black/5"
                  >
                    <div>
                      <p className="font-semibold text-niki-ink">Order {item.order.orderNumber}</p>
                      <p className="mt-0.5 text-sm text-niki-ink/60">{item.product.name}</p>
                    </div>
                    <span
                      className={`rounded-full px-3 py-1 text-xs font-semibold ${statusTone(item.order.status)}`}
                    >
                      {ORDER_STATUS_LABELS[item.order.status] ?? item.order.status}
                    </span>
                  </div>
                ))}
              </div>
            )}

            <h2 className="mt-8 font-display text-lg font-bold text-niki-ink">Your products</h2>
            {vendor.products.length === 0 ? (
              <p className="mt-4 rounded-2xl bg-white p-6 text-sm text-niki-ink/60 ring-1 ring-black/5">
                No products listed yet.
              </p>
            ) : (
              <div className="mt-4 overflow-x-auto rounded-2xl bg-white ring-1 ring-black/5">
                <table className="w-full min-w-[520px] text-left text-sm">
                  <thead className="border-b border-black/5 text-xs uppercase tracking-wide text-niki-ink/50">
                    <tr>
                      <th className="px-5 py-3 font-semibold">Product</th>
                      <th className="px-5 py-3 font-semibold">Price</th>
                      <th className="px-5 py-3 font-semibold">Stock</th>
                      <th className="px-5 py-3 font-semibold">Rating</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-black/5">
                    {vendor.products.map((p) => (
                      <tr key={p.id}>
                        <td className="px-5 py-3">
                          <span className="flex items-center gap-2 font-medium text-niki-ink">
                            <span aria-hidden>{p.emoji}</span>
                            {p.name}
                            {p.isOfficial ? (
                              <BadgeCheck className="h-4 w-4 text-niki-trust" />
                            ) : null}
                          </span>
                        </td>
                        <td className="px-5 py-3 text-niki-ink/70">{formatPrice(p.price)}</td>
                        <td className="px-5 py-3 text-niki-ink/70">{p.stockQuantity}</td>
                        <td className="px-5 py-3 text-niki-ink/70">
                          {p.rating.toFixed(1)} ({p.reviewCount})
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </>
        ) : null}

        <h2 className="mt-8 font-display text-lg font-bold text-niki-ink">Shop tools</h2>
        <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {ACTIONS.map(({ icon: Icon, title, desc, href }) => (
            <Link
              key={title}
              href={href}
              className="group rounded-2xl bg-white p-5 ring-1 ring-black/5 transition-all hover:-translate-y-0.5 hover:shadow-lg hover:shadow-niki-navy/5"
            >
              <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-niki-navy text-niki-orange transition-colors group-hover:bg-niki-orange group-hover:text-white">
                <Icon className="h-5 w-5" />
              </span>
              <h3 className="mt-4 font-semibold text-niki-ink">{title}</h3>
              <p className="mt-1 text-sm text-niki-ink/60">{desc}</p>
            </Link>
          ))}
        </div>
      </Container>
    </>
  );
}
