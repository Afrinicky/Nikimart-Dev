import Link from "next/link";
import type { Metadata } from "next";
import {
  ArrowRight,
  BadgeCheck,
  Banknote,
  GraduationCap,
  LineChart,
  Store,
  Truck,
} from "lucide-react";
import { Container } from "@/components/ui/Container";

export const metadata: Metadata = {
  title: "Sell on NikiMart",
};

const BENEFITS = [
  { icon: GraduationCap, title: "Reach campuses & communities", desc: "Sell to students and shoppers across universities, institutions, and towns in Ghana." },
  { icon: Truck, title: "Flexible delivery & pickup", desc: "Offer same-day delivery, campus drop-off, or in-person pickup — whatever suits you." },
  { icon: Banknote, title: "Fast, local payouts", desc: "Get paid quickly to your Mobile Money or bank account after each completed order." },
  { icon: BadgeCheck, title: "Build trust with verification", desc: "Get a verified badge and stand out as a seller our community can rely on." },
  { icon: LineChart, title: "Simple seller dashboard", desc: "Manage products, orders, and settlements from one clean dashboard." },
  { icon: Store, title: "Any kind of seller", desc: "Local shops, preorder sellers, campus vendors, food vendors, and service providers welcome." },
];

const STEPS = [
  "Register your shop and tell us what you sell",
  "Complete quick verification (KYC) to build trust",
  "List your products, preorders, or services",
  "Start receiving orders and getting paid",
];

export default function SellPage() {
  return (
    <>
      <section className="niki-gradient-hero">
        <Container className="py-16 sm:py-20">
          <div className="max-w-2xl">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-white/10 px-3 py-1 text-xs font-semibold text-niki-gold ring-1 ring-white/15">
              <Store className="h-3.5 w-3.5" />
              Become a NikiMart seller
            </span>
            <h1 className="mt-5 font-display text-3xl font-bold leading-tight text-white sm:text-4xl lg:text-5xl">
              Grow your business on NikiMart
            </h1>
            <p className="mt-4 text-base text-white/70">
              Reach thousands of shoppers across campuses and communities in Ghana. List products,
              preorders, and services — and get paid fast.
            </p>
            <div className="mt-7 flex flex-wrap gap-3">
              <Link
                href="/vendor-register"
                className="flex items-center gap-2 rounded-full bg-niki-orange px-6 py-3 text-sm font-semibold text-white shadow-lg shadow-niki-orange/30 transition-colors hover:bg-niki-orange-light"
              >
                Start selling
                <ArrowRight className="h-4 w-4" />
              </Link>
              <Link
                href="/seller"
                className="flex items-center gap-2 rounded-full px-6 py-3 text-sm font-semibold text-white ring-1 ring-white/30 transition-colors hover:bg-white/10"
              >
                Seller dashboard
              </Link>
            </div>
          </div>
        </Container>
      </section>

      <Container className="py-14">
        <h2 className="font-display text-2xl font-bold text-niki-ink">Why sell on NikiMart?</h2>
        <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {BENEFITS.map(({ icon: Icon, title, desc }) => (
            <div key={title} className="rounded-2xl bg-white p-5 ring-1 ring-black/5">
              <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-niki-navy text-niki-orange">
                <Icon className="h-5 w-5" />
              </span>
              <h3 className="mt-4 font-semibold text-niki-ink">{title}</h3>
              <p className="mt-1.5 text-sm text-niki-ink/60">{desc}</p>
            </div>
          ))}
        </div>

        <h2 className="mt-14 font-display text-2xl font-bold text-niki-ink">How to get started</h2>
        <div className="mt-6 grid gap-4 md:grid-cols-4">
          {STEPS.map((step, i) => (
            <div key={step} className="rounded-2xl bg-niki-surface p-5 ring-1 ring-black/5">
              <span className="font-display text-2xl font-bold text-niki-orange">0{i + 1}</span>
              <p className="mt-2 text-sm font-medium text-niki-ink">{step}</p>
            </div>
          ))}
        </div>

        <div className="mt-12 flex flex-col items-center gap-4 rounded-3xl bg-niki-navy p-10 text-center">
          <h2 className="font-display text-2xl font-bold text-white">Ready to start selling?</h2>
          <p className="max-w-md text-sm text-white/70">
            It only takes a few minutes to register your shop and list your first product.
          </p>
          <Link
            href="/vendor-register"
            className="flex items-center gap-2 rounded-full bg-niki-orange px-6 py-3 text-sm font-semibold text-white transition-colors hover:bg-niki-orange-light"
          >
            Register your shop
            <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      </Container>
    </>
  );
}
