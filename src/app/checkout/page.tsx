import Link from "next/link";
import type { Metadata } from "next";
import { LogIn } from "lucide-react";
import { Container } from "@/components/ui/Container";
import { PageHeader } from "@/components/ui/PageHeader";
import { CheckoutClient } from "@/components/cart/CheckoutClient";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getDeliveryConfig } from "@/lib/settings";
import { getLocations } from "@/lib/locations";
import { isPaymentConfigured } from "@/lib/payments";

export const metadata: Metadata = {
  title: "Checkout — NikiMart",
};

export default async function CheckoutPage() {
  const session = await auth();

  const checkout = session?.user
    ? await (async () => {
        const [pickupPoints, config, locations, profile] = await Promise.all([
          getActivePickupPoints(),
          getDeliveryConfig(),
          getLocations(),
          prisma.user.findUnique({
            where: { id: session.user!.id },
            select: { address: true, preferredPickupId: true },
          }),
        ]);
        // Delivery zones = real places (drop the "Any Location" sentinel).
        const zones = locations
          .filter((l) => l.id !== "any")
          .map((l) => ({ id: l.id, name: l.name, region: l.region, multiplier: l.deliveryZoneMultiplier ?? 1 }));
        return { pickupPoints, config, zones, profile };
      })()
    : null;

  return (
    <>
      <PageHeader title="Checkout" crumbs={[{ label: "Cart", href: "/cart" }, { label: "Checkout" }]} />
      <Container className="py-8">
        {!session?.user ? (
          <div className="mx-auto max-w-md rounded-2xl bg-white p-8 text-center ring-1 ring-black/5">
            <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-niki-surface text-niki-orange">
              <LogIn className="h-6 w-6" />
            </div>
            <h2 className="font-display text-lg font-bold text-niki-ink">Sign in to check out</h2>
            <p className="mt-2 text-sm text-niki-ink/60">
              You need an account to place an order and track it. Your cart is saved.
            </p>
            <Link
              href="/login?callbackUrl=/checkout"
              className="mt-6 inline-flex items-center gap-2 rounded-full bg-niki-orange px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-niki-orange-light"
            >
              Sign in to continue
            </Link>
            <p className="mt-3 text-sm text-niki-ink/60">
              New here?{" "}
              <Link href="/register" className="font-semibold text-niki-orange hover:underline">
                Create an account
              </Link>
            </p>
          </div>
        ) : checkout ? (
          <CheckoutClient
            pickupPoints={checkout.pickupPoints}
            zones={checkout.zones}
            config={checkout.config}
            defaultAddress={checkout.profile?.address ?? ""}
            defaultPickupId={checkout.profile?.preferredPickupId ?? ""}
            paymentEnabled={isPaymentConfigured()}
          />
        ) : null}
      </Container>
    </>
  );
}

async function getActivePickupPoints() {
  const points = await prisma.pickupPoint.findMany({
    where: { isActive: true },
    orderBy: { name: "asc" },
    select: { id: true, name: true, locationName: true },
  });
  return points;
}
