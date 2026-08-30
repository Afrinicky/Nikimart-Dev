import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import type { Metadata } from "next";
import { ArrowLeft } from "lucide-react";
import { Container } from "@/components/ui/Container";
import { ProductForm } from "@/components/admin/ProductForm";
import { requireDashboard } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { mapProduct } from "@/lib/catalog";
import { updateSellerProduct } from "@/lib/seller-actions";
import { getAbroadConfig, getAffiliateRate, getCommissionRate } from "@/lib/settings";
import { getActiveArrivalPoints } from "@/lib/arrival-points-data";

export const metadata: Metadata = { title: "Edit product — Seller — Nickimart" };

type Params = Promise<{ id: string }>;

export default async function EditSellerProductPage({ params }: { params: Params }) {
  const user = await requireDashboard("/seller");
  const { id } = await params;

  const [vendor, categories, defaultCommissionRate, defaultAffiliateRate, arrivalPoints, abroadConfig] =
    await Promise.all([
    prisma.vendor.findFirst({ where: { ownerId: user.id }, select: { id: true } }),
    prisma.category.findMany({
      orderBy: { name: "asc" },
      select: { id: true, name: true, commissionRate: true, affiliateCommissionRate: true },
    }),
    getCommissionRate(),
    getAffiliateRate(),
    // A shipped-from-abroad listing has to land somewhere, and the point the
    // seller picks sets the freight rate, the duty and where the domestic leg
    // starts. Only active points are offered.
    getActiveArrivalPoints(),
    getAbroadConfig(),
  ]);
  if (!vendor) redirect("/seller");

  const row = await prisma.product.findUnique({
    where: { id },
    include: { images: { orderBy: { order: "asc" } } },
  });
  if (!row || row.vendorId !== vendor.id) notFound();

  const product = mapProduct(row);
  const action = updateSellerProduct.bind(null, id);

  return (
    <Container className="max-w-3xl py-8">
      <Link href="/seller/products" className="flex items-center gap-1 text-sm text-niki-ink/60 hover:text-niki-ink">
        <ArrowLeft className="h-4 w-4" />
        Back to my products
      </Link>
      <h1 className="mt-3 font-display text-2xl font-bold text-niki-ink">Edit {product.name}</h1>
      <div className="mt-6 rounded-2xl bg-white p-6 ring-1 ring-niki-edge">
        <ProductForm
          action={action}
          categories={categories}
          vendors={[]}
          product={product}
          lockedVendorId={vendor.id}
          actor="seller"
          cancelHref="/seller/products"
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
