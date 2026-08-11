import Link from "next/link";
import type { Metadata } from "next";
import { Pencil, Plus } from "lucide-react";
import { Container } from "@/components/ui/Container";
import { DeleteButton } from "@/components/admin/DeleteButton";
import { ExportButton } from "@/components/admin/ExportButton";
import { FilterChip } from "@/components/admin/FilterChip";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/session";
import { deleteUser } from "@/lib/admin-actions";
import { ROLES, ROLE_LABELS, isRole } from "@/lib/roles";

export const metadata: Metadata = { title: "Users — Admin — NikiMart" };

export default async function AdminUsersPage({
  searchParams,
}: {
  searchParams: Promise<{ role?: string }>;
}) {
  const me = await requireAdmin();
  const { role } = await searchParams;
  // The overview's role tiles link here with ?role=, so the count you click is
  // the list you land on.
  const roleFilter = role && isRole(role) ? role : null;

  const [users, roleCounts] = await Promise.all([
    prisma.user.findMany({
      where: roleFilter ? { role: roleFilter } : undefined,
      orderBy: { createdAt: "desc" },
      include: {
        vendor: { select: { id: true } },
        affiliate: { select: { id: true } },
        _count: { select: { orders: true } },
      },
    }),
    prisma.user.groupBy({ by: ["role"], _count: { _all: true } }),
  ]);
  const countByRole = new Map(roleCounts.map((r) => [r.role, r._count._all]));
  const total = roleCounts.reduce((s, r) => s + r._count._all, 0);

  return (
    <Container className="py-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-bold text-niki-ink">Users</h1>
          <p className="mt-1 text-sm text-niki-ink/60">
            {users.length} {roleFilter ? `${ROLE_LABELS[roleFilter].toLowerCase()} accounts` : "accounts"}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <ExportButton dataset="users" />
          <Link
            href="/admin/users/new"
            className="flex items-center gap-2 rounded-full bg-niki-orange px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-niki-orange-light"
          >
            <Plus className="h-4 w-4" />
            New user
          </Link>
        </div>
      </div>

      {/* Role filter — mirrors the overview tiles. */}
      <div className="mt-5 flex flex-wrap gap-1.5">
        <FilterChip href="/admin/users" label={`All (${total})`} active={!roleFilter} />
        {ROLES.map((r) => (
          <FilterChip
            key={r}
            href={`/admin/users?role=${r}`}
            label={`${ROLE_LABELS[r]} (${countByRole.get(r) ?? 0})`}
            active={roleFilter === r}
          />
        ))}
      </div>

      <div className="mt-5 overflow-x-auto rounded-2xl bg-white ring-1 ring-black/5">
        <table className="w-full min-w-[640px] text-left text-sm">
          <thead className="border-b border-black/5 text-xs uppercase tracking-wide text-niki-ink/50">
            <tr>
              <th className="px-5 py-3 font-semibold">Name</th>
              <th className="px-5 py-3 font-semibold">Email</th>
              <th className="px-5 py-3 font-semibold">Role</th>
              <th className="px-5 py-3 text-right font-semibold">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-black/5">
            {users.map((u) => {
              // Deleting an account cascades to its orders, so accounts with
              // history can't be removed — the server refuses too.
              const blocker =
                u.id === me.id
                  ? "You can't delete your own account"
                  : u._count.orders > 0
                    ? `Has ${u._count.orders} order${u._count.orders === 1 ? "" : "s"} — deleting would erase them`
                    : u.vendor
                      ? "Owns a shop — reassign or delete the shop first"
                      : u.affiliate
                        ? "Has an affiliate account — remove it first"
                        : null;
              return (
                <tr key={u.id}>
                  <td className="px-5 py-3 font-medium text-niki-ink">
                    {u.name ?? "—"}
                    {u.id === me.id ? <span className="ml-2 text-xs text-niki-ink/40">(you)</span> : null}
                  </td>
                  <td className="px-5 py-3 text-niki-ink/70">{u.email}</td>
                  <td className="px-5 py-3">
                    <span className="rounded-full bg-niki-surface px-2.5 py-1 text-xs font-semibold text-niki-ink/70">
                      {isRole(u.role) ? ROLE_LABELS[u.role] : u.role}
                    </span>
                  </td>
                  <td className="px-5 py-3">
                    <div className="flex items-center justify-end gap-1">
                      <Link
                        href={`/admin/users/${u.id}`}
                        className="flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-semibold text-niki-ink/70 transition-colors hover:bg-niki-navy/5"
                      >
                        <Pencil className="h-3.5 w-3.5" />
                        Edit
                      </Link>
                      <DeleteButton
                        id={u.id}
                        action={deleteUser}
                        disabled={Boolean(blocker)}
                        title={blocker ?? undefined}
                      />
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </Container>
  );
}
