import Link from "next/link";
import type { Metadata } from "next";
import { ArrowLeft } from "lucide-react";
import { Container } from "@/components/ui/Container";
import { ProductForm } from "@/components/admin/ProductForm";
import { prisma } from "@/lib/prisma";
import { createProduct } from "@/lib/admin-actions";

export const metadata: Metadata = { title: "New product — Admin — NikiMart" };

export default async function NewProductPage() {
  const [categories, vendors] = await Promise.all([
    prisma.category.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } }),
    prisma.vendor.findMany({ orderBy: { businessName: "asc" }, select: { id: true, businessName: true } }),
  ]);

  return (
    <Container className="max-w-3xl py-8">
      <Link href="/admin/products" className="flex items-center gap-1 text-sm text-niki-ink/60 hover:text-niki-ink">
        <ArrowLeft className="h-4 w-4" />
        Back to products
      </Link>
      <h1 className="mt-3 font-display text-2xl font-bold text-niki-ink">New product</h1>
      <div className="mt-6 rounded-2xl bg-white p-6 ring-1 ring-black/5">
        <ProductForm action={createProduct} categories={categories} vendors={vendors} submitLabel="Create product" />
      </div>
    </Container>
  );
}
