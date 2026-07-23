import Link from "next/link";
import type { Metadata } from "next";
import { ArrowLeft } from "lucide-react";
import { Container } from "@/components/ui/Container";
import { PageHeader } from "@/components/ui/PageHeader";
import { ShopSettingsForm } from "@/components/seller/ShopSettingsForm";
import { requireDashboard } from "@/lib/session";
import { getSellerVendor } from "@/lib/seller";

export const metadata: Metadata = { title: "Shop Settings — Seller — NikiMart" };

export default async function SellerSettingsPage() {
  const user = await requireDashboard("/seller");
  const vendor = await getSellerVendor(user.id);

  return (
    <>
      <PageHeader
        title="Shop Settings"
        subtitle="Update how your shop appears to buyers."
        crumbs={[{ label: "Seller", href: "/seller" }, { label: "Shop settings" }]}
      >
        <Link href="/seller" className="flex items-center gap-2 rounded-full px-4 py-2 text-sm font-semibold text-niki-ink/70 ring-1 ring-black/10 hover:bg-white">
          <ArrowLeft className="h-4 w-4" />
          Dashboard
        </Link>
      </PageHeader>

      <Container className="max-w-2xl py-8">
        {vendor ? (
          <ShopSettingsForm
            shop={{
              businessName: vendor.businessName,
              description: vendor.description,
              deliveryAvailable: vendor.deliveryAvailable,
              pickupAvailable: vendor.pickupAvailable,
              sameDayDeliveryAvailable: vendor.sameDayDeliveryAvailable,
            }}
          />
        ) : (
          <div className="rounded-2xl bg-niki-navy p-6 text-sm text-white/80">
            You don&apos;t have a shop yet.{" "}
            <Link href="/vendor-register" className="font-semibold text-niki-orange hover:underline">
              Register a shop
            </Link>{" "}
            to manage its settings.
          </div>
        )}
      </Container>
    </>
  );
}
