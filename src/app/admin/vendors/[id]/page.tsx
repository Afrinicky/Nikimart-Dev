import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { ArrowLeft } from "lucide-react";
import { Container } from "@/components/ui/Container";
import { VendorForm } from "@/components/admin/VendorForm";
import { prisma } from "@/lib/prisma";
import { describePoint } from "@/lib/shipping";
import { getActiveConsolidationPoints } from "@/lib/shipping-config";
import { mapVendor } from "@/lib/catalog";
import { updateVendor } from "@/lib/admin-actions";

export const metadata: Metadata = { title: "Edit shop — Admin — Nickimart" };

type Params = Promise<{ id: string }>;

export default async function EditVendorPage({ params }: { params: Params }) {
  const { id } = await params;
  const [row, owners, hubPoints] = await Promise.all([
    prisma.vendor.findUnique({ where: { id } }),
    prisma.user.findMany({
      where: { role: { in: ["SELLER", "ADMIN"] } },
      orderBy: { name: "asc" },
      select: { id: true, name: true, email: true },
    }),
    getActiveConsolidationPoints(),
  ]);
  if (!row) notFound();
  const hubs = hubPoints.map((h) => ({
    id: h.id,
    label: h.pickupPointId ? `${describePoint(h)} · free to collect here` : describePoint(h),
  }));

  const vendor = mapVendor(row);
  const action = updateVendor.bind(null, id);

  return (
    <Container className="max-w-3xl py-8">
      <Link href="/admin/vendors" className="flex items-center gap-1 text-sm text-niki-ink/60 hover:text-niki-ink">
        <ArrowLeft className="h-4 w-4" />
        Back to shops
      </Link>
      <h1 className="mt-3 font-display text-2xl font-bold text-niki-ink">Edit {vendor.businessName}</h1>
      <div className="mt-6 rounded-2xl bg-white p-6 ring-1 ring-niki-edge">
        <VendorForm
          action={action}
          vendor={vendor}
          owners={owners}
          currentOwnerId={row.ownerId}
          hubs={hubs}
          currentConsolidationPointId={row.consolidationPointId}
          submitLabel="Save changes"
        />
      </div>
    </Container>
  );
}
