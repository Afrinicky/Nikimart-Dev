import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { ArrowLeft } from "lucide-react";
import { Container } from "@/components/ui/Container";
import { VendorForm } from "@/components/admin/VendorForm";
import { prisma } from "@/lib/prisma";
import { mapVendor } from "@/lib/catalog";
import { updateVendor } from "@/lib/admin-actions";

export const metadata: Metadata = { title: "Edit shop — Admin — NikiMart" };

type Params = Promise<{ id: string }>;

export default async function EditVendorPage({ params }: { params: Params }) {
  const { id } = await params;
  const [row, owners] = await Promise.all([
    prisma.vendor.findUnique({ where: { id } }),
    prisma.user.findMany({
      where: { role: { in: ["SELLER", "ADMIN"] } },
      orderBy: { name: "asc" },
      select: { id: true, name: true, email: true },
    }),
  ]);
  if (!row) notFound();

  const vendor = mapVendor(row);
  const action = updateVendor.bind(null, id);

  return (
    <Container className="max-w-3xl py-8">
      <Link href="/admin/vendors" className="flex items-center gap-1 text-sm text-niki-ink/60 hover:text-niki-ink">
        <ArrowLeft className="h-4 w-4" />
        Back to shops
      </Link>
      <h1 className="mt-3 font-display text-2xl font-bold text-niki-ink">Edit {vendor.businessName}</h1>
      <div className="mt-6 rounded-2xl bg-white p-6 ring-1 ring-black/5">
        <VendorForm
          action={action}
          vendor={vendor}
          owners={owners}
          currentOwnerId={row.ownerId}
          submitLabel="Save changes"
        />
      </div>
    </Container>
  );
}
