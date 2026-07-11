import Link from "next/link";
import type { Metadata } from "next";
import { Pencil, Plus } from "lucide-react";
import { Container } from "@/components/ui/Container";
import { DeleteButton } from "@/components/admin/DeleteButton";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/session";
import { deleteUser } from "@/lib/admin-actions";
import { ROLE_LABELS, isRole } from "@/lib/roles";

export const metadata: Metadata = { title: "Users — Admin — NikiMart" };

export default async function AdminUsersPage() {
  const me = await requireAdmin();
  const users = await prisma.user.findMany({ orderBy: { createdAt: "desc" } });

  return (
    <Container className="py-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-bold text-niki-ink">Users</h1>
          <p className="mt-1 text-sm text-niki-ink/60">{users.length} accounts</p>
        </div>
        <Link
          href="/admin/users/new"
          className="flex items-center gap-2 rounded-full bg-niki-orange px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-niki-orange-light"
        >
          <Plus className="h-4 w-4" />
          New user
        </Link>
      </div>

      <div className="mt-6 overflow-x-auto rounded-2xl bg-white ring-1 ring-black/5">
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
            {users.map((u) => (
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
                      disabled={u.id === me.id}
                      title={u.id === me.id ? "You can't delete your own account" : undefined}
                    />
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Container>
  );
}
