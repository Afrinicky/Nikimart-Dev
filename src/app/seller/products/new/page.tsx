import Link from "next/link";
import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { ArrowLeft } from "lucide-react";
import { Container } from "@/components/ui/Container";
import { ProductForm } from "@/components/admin/ProductForm";
import { requireDashboard } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { createSellerProduct } from "@/lib/seller-actions";
import { getAffiliateRate, getCommissionRate } from "@/lib/settings";

export const metadata: Metadata = { title: "New product — Seller — Nickimart" };

export default async function NewSellerProductPage() {
  const user = await requireDashboard("/seller");
  const [vendor, categories, defaultCommissionRate, defaultAffiliateRate] = await Promise.all([
    prisma.vendor.findFirst({ where: { ownerId: user.id }, select: { id: true } }),
    prisma.category.findMany({
      orderBy: { name: "asc" },
      select: { id: true, name: true, commissionRate: true, affiliateCommissionRate: true },
    }),
    getCommissionRate(),
    getAffiliateRate(),
  ]);
  if (!vendor) redirect("/seller");

  return (
    <Container className="max-w-3xl py-8">
      <Link href="/seller/products" className="flex items-center gap-1 text-sm text-niki-ink/60 hover:text-niki-ink">
        <ArrowLeft className="h-4 w-4" />
        Back to my products
      </Link>
      <h1 className="mt-3 font-display text-2xl font-bold text-niki-ink">New product</h1>
      <div className="mt-6 rounded-2xl bg-white p-6 ring-1 ring-niki-edge">
        <ProductForm
          action={createSellerProduct}
          categories={categories}
          vendors={[]}
          lockedVendorId={vendor.id}
          actor="seller"
          cancelHref="/seller/products"
          submitLabel="Create product"
          defaultCommissionRate={defaultCommissionRate}
          defaultAffiliateRate={defaultAffiliateRate}
        />
      </div>
    </Container>
  );
}
