import type { Metadata } from "next";
import { PageHeader } from "@/components/ui/PageHeader";
import { Container } from "@/components/ui/Container";
import { ShippingRatesForm } from "@/components/admin/ShippingRatesForm";
import { ExportButton } from "@/components/admin/ExportButton";
import { requireDashboard } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { getSettings } from "@/lib/settings";

export const metadata: Metadata = { title: "Shipping rates — Admin" };
export const dynamic = "force-dynamic";

export default async function AdminShippingPage() {
  await requireDashboard("/admin");

  const [hubs, rateRows, settings] = await Promise.all([
    prisma.pickupPoint.findMany({
      where: { isActive: true },
      orderBy: { name: "asc" },
      select: { id: true, name: true, locationName: true },
    }),
    prisma.shippingRate.findMany({ select: { originHubId: true, destPickupId: true, ratePerCbm: true } }),
    getSettings(),
  ]);

  const routes: Record<string, number> = {};
  for (const r of rateRows) routes[`${r.originHubId}|${r.destPickupId}`] = r.ratePerCbm;

  return (
    <>
      <PageHeader
        title="Shipping rates"
        subtitle="Set the CBM shipping fees for every route between seller hubs and pickup points."
        crumbs={[{ label: "Admin", href: "/admin" }, { label: "Shipping" }]}
      />
      <Container className="py-8">
        <div className="mb-6 flex justify-end">
          <ExportButton dataset="shipping" />
        </div>
        <ShippingRatesForm hubs={hubs} routes={routes} settings={settings as unknown as Record<string, string>} />
      </Container>
    </>
  );
}
