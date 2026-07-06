import type { Metadata } from "next";
import { ShieldCheck } from "lucide-react";
import { Container } from "@/components/ui/Container";
import { PageHeader } from "@/components/ui/PageHeader";
import { StatCard } from "@/components/dashboard/StatCard";
import { LogoutButton } from "@/components/auth/LogoutButton";
import { requireDashboard } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { formatPrice } from "@/lib/format";
import { ORDER_STATUS_LABELS, statusTone } from "@/lib/order-status";
import { ROLE_LABELS, ROLES, type Role } from "@/lib/roles";

export const metadata: Metadata = {
  title: "Admin Dashboard — NikiMart",
};

export default async function AdminDashboardPage() {
  const user = await requireDashboard("/admin");

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
      <PageHeader
        title="Admin Dashboard"
        subtitle="Platform-wide overview of users, shops, products, and orders."
        crumbs={[{ label: "Admin" }]}
      >
        <div className="flex flex-wrap items-center gap-2">
          <span className="flex items-center gap-2 rounded-full bg-niki-navy px-4 py-2 text-sm font-medium text-white">
            <ShieldCheck className="h-4 w-4 text-niki-orange" />
            {user.name}
          </span>
          <LogoutButton />
        </div>
      </PageHeader>

      <Container className="py-8">
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          <StatCard label="Total users" value={userCount} />
          <StatCard label="Shops" value={vendorCount} />
          <StatCard label="Products" value={productCount} />
          <StatCard label="GMV" value={formatPrice(gmv)} />
        </div>

        <div className="mt-4 grid grid-cols-2 gap-4 lg:grid-cols-4">
          <StatCard label="Orders" value={allOrders.length} />
          <StatCard label="Pending verifications" value={pendingVendors} />
          {ROLES.filter((r) => r !== "CUSTOMER" && r !== "ADMIN").map((r) => (
            <StatCard key={r} label={`${ROLE_LABELS[r as Role]}s`} value={roleCounts.get(r) ?? 0} />
          ))}
        </div>

        <div className="mt-8 grid gap-6 lg:grid-cols-2">
          <section>
            <h2 className="font-display text-lg font-bold text-niki-ink">Recent orders</h2>
            <div className="mt-4 space-y-3">
              {orders.map((order) => (
                <div
                  key={order.id}
                  className="flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-white p-4 ring-1 ring-black/5"
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
                    <span className="font-display font-bold text-niki-ink">
                      {formatPrice(order.total)}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </section>

          <section>
            <h2 className="font-display text-lg font-bold text-niki-ink">Newest users</h2>
            <div className="mt-4 overflow-x-auto rounded-2xl bg-white ring-1 ring-black/5">
              <table className="w-full min-w-[420px] text-left text-sm">
                <thead className="border-b border-black/5 text-xs uppercase tracking-wide text-niki-ink/50">
                  <tr>
                    <th className="px-5 py-3 font-semibold">Name</th>
                    <th className="px-5 py-3 font-semibold">Email</th>
                    <th className="px-5 py-3 font-semibold">Role</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-black/5">
                  {recentUsers.map((u) => (
                    <tr key={u.id}>
                      <td className="px-5 py-3 font-medium text-niki-ink">{u.name ?? "—"}</td>
                      <td className="px-5 py-3 text-niki-ink/70">{u.email}</td>
                      <td className="px-5 py-3">
                        <span className="rounded-full bg-niki-surface px-2.5 py-1 text-xs font-semibold text-niki-ink/70">
                          {ROLE_LABELS[(u.role as Role)] ?? u.role}
                        </span>
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
