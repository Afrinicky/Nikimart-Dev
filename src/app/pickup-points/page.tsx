import type { Metadata } from "next";
import { Clock, MapPin, ShieldCheck } from "lucide-react";
import { Container } from "@/components/ui/Container";
import { PageHeader } from "@/components/ui/PageHeader";
import { pickupPoints } from "@/lib/global-data";

export const metadata: Metadata = {
  title: "Pickup Points — NikiMart",
};

export default function PickupPointsPage() {
  return (
    <>
      <PageHeader
        title="Pickup Points"
        subtitle="Collect your orders securely from a trusted NikiMart pickup point near you, using a one-time OTP."
        crumbs={[{ label: "Pickup points" }]}
      />

      <Container className="py-8">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {pickupPoints.map((p) => (
            <div key={p.id} className="rounded-2xl bg-white p-5 ring-1 ring-black/5">
              <div className="flex items-start gap-3">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-niki-navy text-niki-orange">
                  <MapPin className="h-5 w-5" />
                </span>
                <div>
                  <h3 className="font-semibold text-niki-ink">{p.name}</h3>
                  <p className="text-sm text-niki-ink/50">{p.region}</p>
                </div>
              </div>
              <div className="mt-4 space-y-1.5 text-sm text-niki-ink/60">
                <p className="flex items-center gap-2">
                  <Clock className="h-4 w-4 text-niki-ink/40" />
                  {p.hours}
                </p>
                {p.otpSecured ? (
                  <p className="flex items-center gap-2">
                    <ShieldCheck className="h-4 w-4 text-niki-success" />
                    OTP-secured collection
                  </p>
                ) : null}
              </div>
            </div>
          ))}
        </div>

        <p className="mt-8 rounded-2xl bg-niki-surface p-4 text-sm text-niki-ink/60 ring-1 ring-black/5">
          More pickup points are being added across Ghana. Home delivery is also available in many
          areas at checkout.
        </p>
      </Container>
    </>
  );
}
