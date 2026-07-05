import Link from "next/link";
import type { Metadata } from "next";
import { Boxes, ClipboardList, Plus, Settings, Wallet } from "lucide-react";
import { Container } from "@/components/ui/Container";
import { PageHeader } from "@/components/ui/PageHeader";

export const metadata: Metadata = {
  title: "Seller Dashboard — NikiMart",
};

const STATS = [
  { label: "Products listed", value: "0" },
  { label: "Open orders", value: "0" },
  { label: "This month's sales", value: "GH₵0" },
  { label: "Payouts pending", value: "GH₵0" },
];

const ACTIONS = [
  { icon: Plus, title: "Add a product", desc: "List a new product, preorder, or service.", href: "/vendor-register" },
  { icon: Boxes, title: "Manage products", desc: "Edit, restock, or remove your listings.", href: "/seller" },
  { icon: ClipboardList, title: "Orders", desc: "View and fulfil incoming orders.", href: "/seller" },
  { icon: Wallet, title: "Settlements", desc: "Track your payouts and earnings.", href: "/seller" },
  { icon: Settings, title: "Shop settings", desc: "Update your shop profile and delivery options.", href: "/seller" },
];

export default function SellerDashboardPage() {
  return (
    <>
      <PageHeader
        title="Seller Dashboard"
        subtitle="Manage your shop, products, orders, and payouts."
        crumbs={[{ label: "Seller" }]}
      >
        <Link
          href="/vendor-register"
          className="flex items-center gap-2 rounded-full bg-niki-orange px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-niki-orange-light"
        >
          <Plus className="h-4 w-4" />
          Add product
        </Link>
      </PageHeader>

      <Container className="py-8">
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          {STATS.map((s) => (
            <div key={s.label} className="rounded-2xl bg-white p-5 ring-1 ring-black/5">
              <p className="font-display text-2xl font-bold text-niki-ink">{s.value}</p>
              <p className="mt-1 text-sm text-niki-ink/60">{s.label}</p>
            </div>
          ))}
        </div>

        <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {ACTIONS.map(({ icon: Icon, title, desc, href }) => (
            <Link
              key={title}
              href={href}
              className="group rounded-2xl bg-white p-5 ring-1 ring-black/5 transition-all hover:-translate-y-0.5 hover:shadow-lg hover:shadow-niki-navy/5"
            >
              <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-niki-navy text-niki-orange transition-colors group-hover:bg-niki-orange group-hover:text-white">
                <Icon className="h-5 w-5" />
              </span>
              <h3 className="mt-4 font-semibold text-niki-ink">{title}</h3>
              <p className="mt-1 text-sm text-niki-ink/60">{desc}</p>
            </Link>
          ))}
        </div>

        <p className="mt-8 rounded-2xl bg-niki-surface p-4 text-sm text-niki-ink/60 ring-1 ring-black/5">
          The full seller dashboard — product management, order fulfilment, and settlements — is
          being built with accounts and your live data.
        </p>
      </Container>
    </>
  );
}
