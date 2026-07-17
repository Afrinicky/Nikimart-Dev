import Link from "next/link";
import type { Metadata } from "next";
import { Check, Pencil, Plus, X } from "lucide-react";
import { Container } from "@/components/ui/Container";
import { DeleteButton } from "@/components/admin/DeleteButton";
import { prisma } from "@/lib/prisma";
import { deleteVendor, setVendorVerification } from "@/lib/admin-actions";

export const metadata: Metadata = { title: "Shops — Admin — NikiMart" };

const STATUS_TONE: Record<string, string> = {
  verified: "bg-niki-success/10 text-niki-success",
  pending: "bg-niki-gold/15 text-amber-700",
  rejected: "bg-niki-danger/10 text-niki-danger",
};

export default async function AdminVendorsPage() {
  const vendors = await prisma.vendor.findMany({
    orderBy: { businessName: "asc" },
    include: { _count: { select: { products: true } }, owner: true },
  });

  return (
    <Container className="py-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-bold text-niki-ink">Shops</h1>
          <p className="mt-1 text-sm text-niki-ink/60">{vendors.length} shops</p>
        </div>
        <Link
          href="/admin/vendors/new"
          className="flex items-center gap-2 rounded-full bg-niki-orange px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-niki-orange-light"
        >
          <Plus className="h-4 w-4" />
          New shop
        </Link>
      </div>

      <div className="mt-6 overflow-x-auto rounded-2xl bg-white ring-1 ring-black/5">
        <table className="w-full min-w-[820px] text-left text-sm">
          <thead className="border-b border-black/5 text-xs uppercase tracking-wide text-niki-ink/50">
            <tr>
              <th className="px-5 py-3 font-semibold">Shop</th>
              <th className="px-5 py-3 font-semibold">Owner</th>
              <th className="px-5 py-3 font-semibold">Products</th>
              <th className="px-5 py-3 font-semibold">Status</th>
              <th className="px-5 py-3 text-right font-semibold">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-black/5">
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
