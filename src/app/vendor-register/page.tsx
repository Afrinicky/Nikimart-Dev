import Link from "next/link";
import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { BadgeCheck, Store, Wallet } from "lucide-react";
import { Container } from "@/components/ui/Container";
import { PageHeader } from "@/components/ui/PageHeader";
import { VendorRegisterForm } from "@/components/seller/VendorRegisterForm";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const metadata: Metadata = {
  title: "Register your shop — Nickimart",
};

export const dynamic = "force-dynamic";

export default async function VendorRegisterPage() {
  const session = await auth();

  // Logged-out visitors get a proper landing with sign-in / create-account
  // options that return here (not a bare redirect to /login).
  if (!session?.user) {
    return (
      <>
        <PageHeader
          title="Start selling on Nickimart"
          subtitle="Open your shop, reach buyers across Ghana, and get paid straight to your MoMo or bank."
          crumbs={[{ label: "Sell", href: "/sell" }, { label: "Register" }]}
        />
        <Container className="max-w-xl py-8">
          <div className="rounded-3xl bg-niki-black p-6 text-white sm:p-8">
            <div className="flex items-center gap-2 text-niki-orange">
              <Store className="h-5 w-5" />
              <span className="font-display font-bold">Sell to thousands of buyers</span>
            </div>
            <ul className="mt-4 space-y-2 text-sm text-white/70">
              <li className="flex items-start gap-2"><BadgeCheck className="mt-0.5 h-4 w-4 text-niki-orange" /> List products in minutes — no setup fee.</li>
              <li className="flex items-start gap-2"><BadgeCheck className="mt-0.5 h-4 w-4 text-niki-orange" /> Get paid to Mobile Money or your bank account.</li>
              <li className="flex items-start gap-2"><BadgeCheck className="mt-0.5 h-4 w-4 text-niki-orange" /> Track orders and settlements from your seller dashboard.</li>
            </ul>
          </div>
          <div className="mt-6 flex flex-col gap-3 sm:flex-row">
            <Link
              href="/register?callbackUrl=/vendor-register"
              className="flex-1 rounded-full bg-niki-orange px-5 py-3 text-center text-sm font-semibold text-white transition-colors hover:bg-niki-orange-light"
            >
              Create a free account
            </Link>
            <Link
              href="/login?callbackUrl=/vendor-register"
              className="flex-1 rounded-full px-5 py-3 text-center text-sm font-semibold text-niki-ink/70 ring-1 ring-niki-edge-strong transition-colors hover:bg-white"
            >
              Sign in
            </Link>
          </div>
        </Container>
      </>
    );
  }

  // Already runs a shop → straight to the seller dashboard.
  const existing = await prisma.vendor.findFirst({
    where: { ownerId: session.user.id },
    select: { id: true },
  });
  if (existing) redirect("/seller");

  const hubPoints = await prisma.pickupPoint.findMany({
    where: { isActive: true },
    orderBy: { name: "asc" },
    select: { id: true, name: true, locationName: true },
  });
  const hubs = hubPoints.map((h) => ({ id: h.id, label: `${h.locationName} — ${h.name}` }));

  return (
    <>
      <PageHeader
        title="Register your shop"
        subtitle="Tell us about your business and how you'd like to get paid. It takes about 2 minutes."
        crumbs={[{ label: "Sell", href: "/sell" }, { label: "Register" }]}
      />
      <Container className="py-8">
        <div className="mx-auto max-w-2xl">
          <div className="mb-6 flex items-center gap-3 rounded-2xl bg-niki-orange/10 px-4 py-3 text-sm text-niki-ink/70">
            <Wallet className="h-5 w-5 shrink-0 text-niki-orange" />
            <span>Your payment details stay private and are only used to settle your earnings.</span>
          </div>
          <VendorRegisterForm
            defaultName={session.user.name ?? undefined}
            defaultEmail={session.user.email ?? undefined}
            hubs={hubs}
          />
        </div>
      </Container>
    </>
  );
}
