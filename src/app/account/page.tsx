import Link from "next/link";
import type { Metadata } from "next";
import { ClipboardList, Heart, MapPin, Package, Settings, Store, User } from "lucide-react";
import { Container } from "@/components/ui/Container";
import { PageHeader } from "@/components/ui/PageHeader";
import { StatCard } from "@/components/dashboard/StatCard";
import { LogoutButton } from "@/components/auth/LogoutButton";
import { requireDashboard } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { formatPrice } from "@/lib/format";
import { ORDER_STATUS_LABELS, statusTone } from "@/lib/order-status";
import { ROLE_LABELS, ROLE_HOME } from "@/lib/roles";

export const metadata: Metadata = {
  title: "My Account — NikiMart",
};

const LINKS = [
  { icon: ClipboardList, title: "My orders", desc: "Track and manage your orders.", href: "/orders" },
  { icon: Heart, title: "Saved items", desc: "Products you've saved for later.", href: "/products" },
  { icon: MapPin, title: "Addresses & pickup", desc: "Manage delivery and pickup details.", href: "/pickup-points" },
  { icon: Store, title: "Sell on NikiMart", desc: "Start or manage your shop.", href: "/sell" },
  { icon: Settings, title: "Settings", desc: "Update your profile and preferences.", href: "/account" },
];

export default async function AccountPage() {
  const user = await requireDashboard("/account");

  const orders = await prisma.order.findMany({
    where: { userId: user.id },
    orderBy: { createdAt: "desc" },
    include: { items: true },
  });

  const totalSpent = orders
    .filter((o) => o.status !== "cancelled")
    .reduce((sum, o) => sum + o.total, 0);
  const activeOrders = orders.filter(
    (o) => o.status !== "delivered" && o.status !== "cancelled",
  ).length;

  const isStaff = user.role !== "CUSTOMER";

  return (
    <>
      <PageHeader title={`Hi, ${user.name ?? "there"}`} crumbs={[{ label: "Account" }]}>
        <div className="flex flex-wrap items-center gap-2">
          <span className="flex items-center gap-2 rounded-full bg-niki-surface px-4 py-2 text-sm font-medium text-niki-ink/70 ring-1 ring-black/5">
            <User className="h-4 w-4 text-niki-orange" />
            {ROLE_LABELS[user.role]}
          </span>
          <LogoutButton />
        </div>
      </PageHeader>

      <Container className="py-8">
        {isStaff ? (
          <div className="mb-6 flex flex-wrap items-center gap-3 rounded-2xl bg-niki-navy p-5">
            <p className="flex-1 text-sm text-white/80">
              You have a <span className="font-semibold text-white">{ROLE_LABELS[user.role]}</span>{" "}
              dashboard with tools for your role.
            </p>
            <Link
              href={ROLE_HOME[user.role]}
              className="rounded-full bg-niki-orange px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-niki-orange-light"
            >
              Open dashboard
            </Link>
          </div>
        ) : null}

        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          <StatCard label="Total orders" value={orders.length} />
          <StatCard label="Active orders" value={activeOrders} />
          <StatCard label="Total spent" value={formatPrice(totalSpent)} />
          <StatCard label="Saved items" value={0} />
        </div>

        <h2 className="mt-8 font-display text-lg font-bold text-niki-ink">Recent orders</h2>
        {orders.length === 0 ? (
          <div className="mt-4 rounded-2xl bg-white p-8 text-center ring-1 ring-black/5">
            <Package className="mx-auto h-8 w-8 text-niki-ink/30" />
            <p className="mt-3 text-sm text-niki-ink/60">You haven&apos;t placed any orders yet.</p>
            <Link
              href="/products"
              className="mt-4 inline-block rounded-full bg-niki-orange px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-niki-orange-light"
            >
              Start shopping
            </Link>
          </div>
        ) : (
          <div className="mt-4 space-y-3">
            {orders.map((order) => (
              <div
                key={order.id}
                className="flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-white p-5 ring-1 ring-black/5"
              >
                <div>
                  <p className="font-semibold text-niki-ink">Order {order.orderNumber}</p>
                  <p className="mt-0.5 text-sm text-niki-ink/60">
                    {order.items.length} item{order.items.length === 1 ? "" : "s"} ·{" "}
                    {order.createdAt.toLocaleDateString("en-GH", {
                      day: "numeric",
                      month: "short",
                      year: "numeric",
                    })}
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <span
                    className={`rounded-full px-3 py-1 text-xs font-semibold ${statusTone(order.status)}`}
                  >
                    {ORDER_STATUS_LABELS[order.status] ?? order.status}
                  </span>
                  <span className="font-display font-bold text-niki-ink">
                    {formatPrice(order.total)}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}

        <h2 className="mt-8 font-display text-lg font-bold text-niki-ink">Quick actions</h2>
        <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {LINKS.map(({ icon: Icon, title, desc, href }) => (
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
