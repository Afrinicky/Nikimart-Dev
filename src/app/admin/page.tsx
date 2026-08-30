import Link from "next/link";
import type { Metadata } from "next";
import { Container } from "@/components/ui/Container";
import { StatCard } from "@/components/dashboard/StatCard";
import { prisma } from "@/lib/prisma";
import { formatPrice } from "@/lib/format";
import { ORDER_STATUS_LABELS, statusTone } from "@/lib/order-status";
import { ROLE_LABELS, ROLES, type Role } from "@/lib/roles";

export const metadata: Metadata = {
  title: "Admin Dashboard — Nickimart",
};

export default async function AdminDashboardPage() {
  const [
    userCount,
    vendorCount,
    productCount,
    orders,
    pendingVendors,
    usersByRole,
    recentUsers,
  ] = await Promise.all([
    prisma.user.count(),
    prisma.vendor.count(),
    prisma.product.count(),
    prisma.order.findMany({ orderBy: { createdAt: "desc" }, include: { user: true }, take: 8 }),
    prisma.vendor.count({ where: { verificationStatus: "pending" } }),
    prisma.user.groupBy({ by: ["role"], _count: { _all: true } }),
    prisma.user.findMany({ orderBy: { createdAt: "desc" }, take: 6 }),
  ]);

  const allOrders = await prisma.order.findMany({ select: { total: true, status: true } });
  const gmv = allOrders.filter((o) => o.status !== "cancelled").reduce((s, o) => s + o.total, 0);

  const roleCounts = new Map(usersByRole.map((r) => [r.role, r._count._all]));

  return (
    <>
      <Container className="py-8">
        <div>
          <h1 className="font-display text-2xl font-bold text-niki-ink">Overview</h1>
          <p className="mt-1 text-sm text-niki-ink/60">
            Platform-wide metrics for users, shops, products, and orders.
          </p>
        </div>

        {/* Every tile drills through to the list it counts. */}
        <div className="mt-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
          <StatCard label="Total users" value={userCount} href="/admin/users" />
          <StatCard label="Shops" value={vendorCount} href="/admin/vendors" />
          <StatCard label="Products" value={productCount} href="/admin/products" />
          <StatCard label="GMV" value={formatPrice(gmv)} href="/admin/finance/breakdown/gmv" />
        </div>

        <div className="mt-4 grid grid-cols-2 gap-4 lg:grid-cols-4">
          <StatCard label="Orders" value={allOrders.length} href="/admin/orders" />
          <StatCard
            label="Pending verifications"
            value={pendingVendors}
            href="/admin/vendors?status=pending"
          />
          {ROLES.filter((r) => r !== "CUSTOMER" && r !== "ADMIN").map((r) => (
            <StatCard
              key={r}
              label={`${ROLE_LABELS[r as Role]}s`}
              value={roleCounts.get(r) ?? 0}
              href={`/admin/users?role=${r}`}
            />
          ))}
        </div>

        <div className="mt-8 grid gap-6 lg:grid-cols-2">
          <section>
            <div className="flex items-center justify-between gap-3">
              <h2 className="font-display text-lg font-bold text-niki-ink">Recent orders</h2>
              <Link href="/admin/orders" className="text-sm font-semibold text-niki-orange hover:underline">
                View all
              </Link>
            </div>
            <div className="mt-4 space-y-3">
              {orders.map((order) => (
                <Link
                  key={order.id}
                  href={`/admin/orders/${order.id}`}
                  className="flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-white p-4 ring-1 ring-niki-edge transition-colors hover:bg-niki-black/5"
                >
                  <div>
                    <p className="font-semibold text-niki-ink">{order.orderNumber}</p>
                    <p className="mt-0.5 text-sm text-niki-ink/60">{order.user.name ?? order.user.email}</p>
                  </div>
                  <div className="flex items-center gap-3">
                    <span
                      className={`rounded-full px-3 py-1 text-xs font-semibold ${statusTone(order.status)}`}
                    >
                      {ORDER_STATUS_LABELS[order.status] ?? order.status}
                    </span>
                    <span className="font-figures font-bold text-niki-ink">
                      {formatPrice(order.total)}
                    </span>
                  </div>
                </Link>
              ))}
              {orders.length === 0 ? (
                <p className="rounded-2xl bg-white p-6 text-sm text-niki-ink/50 ring-1 ring-niki-edge">
                  No orders yet.
                </p>
              ) : null}
            </div>
          </section>

          <section>
            <div className="flex items-center justify-between gap-3">
              <h2 className="font-display text-lg font-bold text-niki-ink">Newest users</h2>
              <Link href="/admin/users" className="text-sm font-semibold text-niki-orange hover:underline">
                View all
              </Link>
            </div>
            <div className="mt-4 overflow-x-auto rounded-2xl bg-white ring-1 ring-niki-edge">
              <table className="w-full min-w-[420px] text-left text-sm">
                <thead className="border-b border-niki-edge text-xs uppercase tracking-wide text-niki-ink/50">
                  <tr>
                    <th className="px-5 py-3 font-semibold">Name</th>
                    <th className="px-5 py-3 font-semibold">Email</th>
                    <th className="px-5 py-3 font-semibold">Role</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-niki-edge">
                  {recentUsers.map((u) => (
                    <tr key={u.id} className="transition-colors hover:bg-niki-black/5">
                      <td className="px-5 py-3 font-medium text-niki-ink">
                        <Link href={`/admin/users/${u.id}`} className="hover:text-niki-orange">
                          {u.name ?? "—"}
                        </Link>
                      </td>
                      <td className="px-5 py-3 text-niki-ink/70">{u.email}</td>
                      <td className="px-5 py-3">
                        <Link
                          href={`/admin/users?role=${u.role}`}
                          className="rounded-full bg-niki-surface px-2.5 py-1 text-xs font-semibold text-niki-ink/70 transition-colors hover:bg-niki-black hover:text-white"
                        >
                          {ROLE_LABELS[(u.role as Role)] ?? u.role}
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </div>
      </Container>
    </>
  );
}
