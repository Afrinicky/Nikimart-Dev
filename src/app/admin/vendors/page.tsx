import Link from "next/link";
import type { Metadata } from "next";
import { Check, Pencil, Plus, X } from "lucide-react";
import { Container } from "@/components/ui/Container";
import { DeleteButton } from "@/components/admin/DeleteButton";
import { ExportButton } from "@/components/admin/ExportButton";
import { FilterChip } from "@/components/admin/FilterChip";
import { prisma } from "@/lib/prisma";
import { deleteVendor, setVendorVerification } from "@/lib/admin-actions";

export const metadata: Metadata = { title: "Shops — Admin — Nickimart" };

const STATUS_TONE: Record<string, string> = {
  verified: "bg-niki-success/10 text-niki-success",
  pending: "bg-niki-gold/15 text-amber-700",
  rejected: "bg-niki-danger/10 text-niki-danger",
};

const STATUSES = ["pending", "verified", "rejected"] as const;

export default async function AdminVendorsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  const { status } = await searchParams;
  // "Pending verifications" on the overview links here with ?status=pending.
  const statusFilter = STATUSES.find((s) => s === status) ?? null;

  const [vendors, statusCounts] = await Promise.all([
    prisma.vendor.findMany({
      where: statusFilter ? { verificationStatus: statusFilter } : undefined,
      orderBy: { businessName: "asc" },
      include: { _count: { select: { products: true } }, owner: true },
    }),
    prisma.vendor.groupBy({ by: ["verificationStatus"], _count: { _all: true } }),
  ]);
  const countByStatus = new Map(statusCounts.map((s) => [s.verificationStatus, s._count._all]));
  const total = statusCounts.reduce((s, r) => s + r._count._all, 0);

  return (
    <Container className="py-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-bold text-niki-ink">Shops</h1>
          <p className="mt-1 text-sm text-niki-ink/60">
            {vendors.length} {statusFilter ? `${statusFilter} shops` : "shops"}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <ExportButton dataset="shops" />
          <Link
            href="/admin/vendors/new"
            className="flex items-center gap-2 rounded-full bg-niki-orange px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-niki-orange-light"
          >
            <Plus className="h-4 w-4" />
            New shop
          </Link>
        </div>
      </div>

      <div className="mt-5 flex flex-wrap gap-1.5">
        <FilterChip href="/admin/vendors" label={`All (${total})`} active={!statusFilter} />
        {STATUSES.map((s) => (
          <FilterChip
            key={s}
            href={`/admin/vendors?status=${s}`}
            label={`${s[0].toUpperCase()}${s.slice(1)} (${countByStatus.get(s) ?? 0})`}
            active={statusFilter === s}
          />
        ))}
      </div>

      <div className="mt-5 overflow-x-auto rounded-2xl bg-white ring-1 ring-niki-edge">
        <table className="w-full min-w-[820px] text-left text-sm">
          <thead className="border-b border-niki-edge text-xs uppercase tracking-wide text-niki-ink/50">
            <tr>
              <th className="px-5 py-3 font-semibold">Shop</th>
              <th className="px-5 py-3 font-semibold">Owner</th>
              <th className="px-5 py-3 font-semibold">Products</th>
              <th className="px-5 py-3 font-semibold">Status</th>
              <th className="px-5 py-3 text-right font-semibold">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-niki-edge">
            {vendors.map((v) => (
              <tr key={v.id}>
                <td className="px-5 py-3 font-medium text-niki-ink">{v.businessName}</td>
                <td className="px-5 py-3 text-niki-ink/70">{v.owner?.name ?? v.owner?.email ?? "—"}</td>
                <td className="px-5 py-3 text-niki-ink/70">{v._count.products}</td>
                <td className="px-5 py-3">
                  <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${STATUS_TONE[v.verificationStatus] ?? "bg-niki-ink/10 text-niki-ink/60"}`}>
                    {v.verificationStatus}
                  </span>
                </td>
                <td className="px-5 py-3">
                  <div className="flex items-center justify-end gap-1">
                    {v.verificationStatus !== "verified" ? (
                      <form action={setVendorVerification}>
                        <input type="hidden" name="id" value={v.id} />
                        <input type="hidden" name="status" value="verified" />
                        <button type="submit" className="flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-semibold text-niki-success transition-colors hover:bg-niki-success/10">
                          <Check className="h-3.5 w-3.5" />
                          Verify
                        </button>
                      </form>
                    ) : (
                      <form action={setVendorVerification}>
                        <input type="hidden" name="id" value={v.id} />
                        <input type="hidden" name="status" value="rejected" />
                        <button type="submit" className="flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-semibold text-niki-ink/60 transition-colors hover:bg-niki-danger/10 hover:text-niki-danger">
                          <X className="h-3.5 w-3.5" />
                          Unverify
                        </button>
                      </form>
                    )}
                    <Link
                      href={`/admin/vendors/${v.id}`}
                      className="flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-semibold text-niki-ink/70 transition-colors hover:bg-niki-navy/5"
                    >
                      <Pencil className="h-3.5 w-3.5" />
                      Edit
                    </Link>
                    <DeleteButton
                      id={v.id}
                      action={deleteVendor}
                      disabled={v._count.products > 0}
                      title={v._count.products > 0 ? "Remove or reassign its products first" : undefined}
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
