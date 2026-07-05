import Link from "next/link";
import type { Metadata } from "next";
import { BadgeCheck, HandCoins, PackageCheck, ShieldCheck, Undo2, UserCheck } from "lucide-react";
import { Container } from "@/components/ui/Container";
import { PageHeader } from "@/components/ui/PageHeader";

export const metadata: Metadata = {
  title: "Buyer Protection — NikiMart",
};

const GUARANTEES = [
  { icon: HandCoins, title: "Secure payments", body: "Your payment is held safely and only released once your order is confirmed on its way." },
  { icon: PackageCheck, title: "Delivery guarantee", body: "Get your item as described, or we help make it right — including returns where eligible." },
  { icon: Undo2, title: "Refunds & returns", body: "If an item arrives damaged, defective, or not as described, you're covered by our refund policy." },
  { icon: UserCheck, title: "Verified sellers", body: "We verify sellers so you can shop with confidence. Look for the verified badge on shops." },
  { icon: BadgeCheck, title: "OTP pickup", body: "Collect orders securely with a one-time code, so only you can pick up your package." },
  { icon: ShieldCheck, title: "Dispute support", body: "If something goes wrong, our support team steps in to resolve it fairly." },
];

export default function BuyerProtectionPage() {
  return (
    <>
      <PageHeader
        title="NikiMart Buyer Protection"
        subtitle="Shop local and global with confidence — every order is backed by protections that keep you safe."
        crumbs={[{ label: "Buyer protection" }]}
        tone="dark"
      />

      <Container className="py-10">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {GUARANTEES.map(({ icon: Icon, title, body }) => (
            <div key={title} className="rounded-2xl bg-white p-5 ring-1 ring-black/5">
              <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-niki-success/10 text-niki-success">
                <Icon className="h-5 w-5" />
              </span>
              <h3 className="mt-4 font-semibold text-niki-ink">{title}</h3>
              <p className="mt-1.5 text-sm text-niki-ink/60">{body}</p>
            </div>
          ))}
        </div>

        <div className="mt-10 flex flex-wrap items-center justify-between gap-4 rounded-3xl bg-niki-navy p-8">
          <p className="max-w-xl text-sm text-white/80">
            Have a problem with an order? Our team is here to help you resolve it quickly and fairly.
          </p>
          <Link
            href="/help"
            className="rounded-full bg-niki-orange px-6 py-3 text-sm font-semibold text-white transition-colors hover:bg-niki-orange-light"
          >
            Contact support
          </Link>
        </div>
      </Container>
    </>
  );
}
