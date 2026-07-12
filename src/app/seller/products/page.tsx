import Link from "next/link";
import type { Metadata } from "next";
import { ArrowLeft, Pencil, Plus } from "lucide-react";
import { Container } from "@/components/ui/Container";
import { DeleteButton } from "@/components/admin/DeleteButton";
import { requireDashboard } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { formatPrice } from "@/lib/format";
import { deleteSellerProduct } from "@/lib/seller-actions";

export const metadata: Metadata = { title: "My Products — Seller — NikiMart" };

export default async function SellerProductsPage() {
  const user = await requireDashboard("/seller");
  const vendor = await prisma.vendor.findFirst({
    where: { ownerId: user.id },
    include: { products: { orderBy: { name: "asc" } } },
  });

  return (
    <Container className="py-8">
      <Link href="/seller" className="flex items-center gap-1 text-sm text-niki-ink/60 hover:text-niki-ink">
        <ArrowLeft className="h-4 w-4" />
        Back to dashboard
      </Link>

      <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-bold text-niki-ink">My Products</h1>
          <p className="mt-1 text-sm text-niki-ink/60">
            {vendor ? `${vendor.products.length} listed in ${vendor.businessName}` : "No shop yet"}
          </p>
        </div>
        {vendor ? (
          <Link
            href="/seller/products/new"
            className="flex items-center gap-2 rounded-full bg-niki-orange px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-niki-orange-light"
          >
            <Plus className="h-4 w-4" />
            New product
          </Link>
        ) : null}
      </div>

      {!vendor ? (
        <div className="mt-6 rounded-2xl bg-niki-navy p-6 text-sm text-white/80">
          You don&apos;t have a shop yet. Register your business to start listing products.
        </div>
      ) : (
        <div className="mt-6 overflow-x-auto rounded-2xl bg-white ring-1 ring-black/5">
          <table className="w-full min-w-[560px] text-left text-sm">
            <thead className="border-b border-black/5 text-xs uppercase tracking-wide text-niki-ink/50">
              <tr>
                <th className="px-5 py-3 font-semibold">Product</th>
                <th className="px-5 py-3 font-semibold">Price</th>
                <th className="px-5 py-3 font-semibold">Stock</th>
                <th className="px-5 py-3 text-right font-semibold">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-black/5">
              {vendor.products.map((p) => (
                <tr key={p.id}>
                  <td className="px-5 py-3">
                    <span className="flex items-center gap-2 font-medium text-niki-ink">
                      <span aria-hidden>{p.emoji}</span>
                      {p.name}
                    </span>
                  </td>
                  <td className="px-5 py-3 text-niki-ink/70">{formatPrice(p.price)}</td>
                  <td className="px-5 py-3 text-niki-ink/70">{p.stockQuantity}</td>
                  <td className="px-5 py-3">
                    <div className="flex items-center justify-end gap-1">
                      <Link
                        href={`/seller/products/${p.id}`}
                        className="flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-semibold text-niki-ink/70 transition-colors hover:bg-niki-navy/5"
                      >
                        <Pencil className="h-3.5 w-3.5" />
                        Edit
                      </Link>
                      <DeleteButton id={p.id} action={deleteSellerProduct} />
                    </div>
                  </td>
                </tr>
              ))}
              {vendor.products.length === 0 ? (
                <tr>
                  <td colSpan={4} className="px-5 py-10 text-center text-sm text-niki-ink/50">
                    No products yet — add your first one.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      )}
    </Container>
  );
}
