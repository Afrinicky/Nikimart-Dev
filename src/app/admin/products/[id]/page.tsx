import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { ArrowLeft } from "lucide-react";
import { Container } from "@/components/ui/Container";
import { ProductForm } from "@/components/admin/ProductForm";
import { prisma } from "@/lib/prisma";
import { mapProduct } from "@/lib/catalog";
import { updateProduct } from "@/lib/admin-actions";
import { getAbroadConfig, getAffiliateRate, getCommissionRate } from "@/lib/settings";
import { getActiveArrivalPoints } from "@/lib/arrival-points-data";

export const metadata: Metadata = { title: "Edit product — Admin — Nickimart" };

type Params = Promise<{ id: string }>;

export default async function EditProductPage({ params }: { params: Params }) {
  const { id } = await params;
  const [row, categories, vendors, defaultCommissionRate, defaultAffiliateRate, arrivalPoints, abroadConfig] =
    await Promise.all([
    prisma.product.findUnique({ where: { id }, include: { images: { orderBy: { order: "asc" } } } }),
    prisma.category.findMany({
      orderBy: { name: "asc" },
      select: { id: true, name: true, commissionRate: true, affiliateCommissionRate: true },
    }),
    prisma.vendor.findMany({ orderBy: { businessName: "asc" }, select: { id: true, businessName: true } }),
    getCommissionRate(),
    getAffiliateRate(),
    // A shipped-from-abroad listing has to land somewhere, and the point the
    // seller picks sets the freight rate, the duty and where the domestic leg
    // starts. Only active points are offered.
    getActiveArrivalPoints(),
    getAbroadConfig(),
  ]);
  if (!row) notFound();

  const product = mapProduct(row);
  const action = updateProduct.bind(null, id);

  return (
    <Container className="max-w-3xl py-8">
      <Link href="/admin/products" className="flex items-center gap-1 text-sm text-niki-ink/60 hover:text-niki-ink">
        <ArrowLeft className="h-4 w-4" />
        Back to products
      </Link>
      <h1 className="mt-3 font-display text-2xl font-bold text-niki-ink">Edit {product.name}</h1>
      <div className="mt-6 rounded-2xl bg-white p-6 ring-1 ring-niki-edge">
        <ProductForm
          action={action}
          categories={categories}
          vendors={vendors}
          product={product}
          submitLabel="Save changes"
          defaultCommissionRate={defaultCommissionRate}
          defaultAffiliateRate={defaultAffiliateRate}
          arrivalPoints={arrivalPoints}
          defaultGhanaTaxRate={abroadConfig.ghanaTaxRate}
          defaultDutyPercent={abroadConfig.defaultDutyPercent}
          partialPaymentEnabled={abroadConfig.partialPaymentEnabled}
        />
      </div>
    </Container>
  );
}
