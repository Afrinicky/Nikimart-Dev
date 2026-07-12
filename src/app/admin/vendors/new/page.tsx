import Link from "next/link";
import type { Metadata } from "next";
import { ArrowLeft } from "lucide-react";
import { Container } from "@/components/ui/Container";
import { VendorForm } from "@/components/admin/VendorForm";
import { prisma } from "@/lib/prisma";
import { createVendor } from "@/lib/admin-actions";

export const metadata: Metadata = { title: "New shop — Admin — NikiMart" };

export default async function NewVendorPage() {
  const owners = await prisma.user.findMany({
    where: { role: { in: ["SELLER", "ADMIN"] } },
    orderBy: { name: "asc" },
    select: { id: true, name: true, email: true },
  });

  return (
    <Container className="max-w-3xl py-8">
      <Link href="/admin/vendors" className="flex items-center gap-1 text-sm text-niki-ink/60 hover:text-niki-ink">
        <ArrowLeft className="h-4 w-4" />
        Back to shops
      </Link>
      <h1 className="mt-3 font-display text-2xl font-bold text-niki-ink">New shop</h1>
      <div className="mt-6 rounded-2xl bg-white p-6 ring-1 ring-black/5">
        <VendorForm action={createVendor} owners={owners} submitLabel="Create shop" />
      </div>
    </Container>
  );
}
