import Link from "next/link";
import type { Metadata } from "next";
import { ClipboardList, Heart, MapPin, Settings, Store, User } from "lucide-react";
import { Container } from "@/components/ui/Container";
import { PageHeader } from "@/components/ui/PageHeader";

export const metadata: Metadata = {
  title: "My Account — NikiMart",
};

const LINKS = [
  { icon: ClipboardList, title: "My orders", desc: "Track and manage your orders.", href: "/orders" },
  { icon: Heart, title: "Saved items", desc: "Products you've saved for later.", href: "/products" },
  { icon: MapPin, title: "Addresses & pickup", desc: "Manage delivery and pickup details.", href: "/account" },
  { icon: Store, title: "Sell on NikiMart", desc: "Start or manage your shop.", href: "/sell" },
  { icon: Settings, title: "Settings", desc: "Update your profile and preferences.", href: "/account" },
];

export default function AccountPage() {
  return (
    <>
      <PageHeader title="My Account" crumbs={[{ label: "Account" }]}>
        <span className="flex items-center gap-2 rounded-full bg-niki-surface px-4 py-2 text-sm font-medium text-niki-ink/70 ring-1 ring-black/5">
          <User className="h-4 w-4 text-niki-orange" />
          Guest
        </span>
      </PageHeader>

      <Container className="py-8">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {LINKS.map(({ icon: Icon, title, desc, href }) => (
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

        <div className="mt-8 flex flex-wrap items-center gap-3 rounded-2xl bg-niki-navy p-6">
          <p className="flex-1 text-sm text-white/80">
            Sign in to see your orders, saved items, and personalised recommendations.
          </p>
          <Link
            href="/login"
            className="rounded-full bg-niki-orange px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-niki-orange-light"
          >
            Sign in
          </Link>
        </div>
      </Container>
    </>
  );
}
