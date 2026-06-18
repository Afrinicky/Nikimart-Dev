import Link from "next/link";
import { Container } from "@/components/ui/Container";

const FOOTER_COLUMNS: { title: string; links: { label: string; href: string }[] }[] = [
  {
    title: "Shop",
    links: [
      { label: "All Products", href: "/products" },
      { label: "Preorder Deals", href: "/preorders" },
      { label: "Services", href: "/services" },
      { label: "Shop by Campus", href: "/campus" },
      { label: "NikiMart Official Store", href: "/categories/nikimart-official-store" },
    ],
  },
  {
    title: "Sell",
    links: [
      { label: "Sell on NikiMart", href: "/sell" },
      { label: "Vendor Registration", href: "/vendor-register" },
      { label: "Seller Dashboard", href: "/seller" },
    ],
  },
  {
    title: "Support",
    links: [
      { label: "Help Centre", href: "/help" },
      { label: "Track an Order", href: "/orders" },
      { label: "Contact Us", href: "/help" },
    ],
  },
  {
    title: "Legal",
    links: [
      { label: "Terms & Conditions", href: "/legal/terms" },
      { label: "Privacy Policy", href: "/legal/privacy" },
      { label: "Return & Refund Policy", href: "/legal/returns" },
      { label: "Seller Policy", href: "/legal/seller-policy" },
      { label: "Preorder Policy", href: "/legal/preorder-policy" },
      { label: "Delivery Policy", href: "/legal/delivery-policy" },
    ],
  },
];

export function Footer() {
  return (
    <footer className="bg-niki-navy text-white/70">
      <Container className="grid grid-cols-2 gap-8 py-12 sm:grid-cols-4 lg:grid-cols-5">
        <div className="col-span-2 sm:col-span-4 lg:col-span-1">
          <div className="flex items-center gap-2">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-niki-orange to-niki-gold font-display text-lg font-bold text-niki-navy">
              N
            </span>
            <span className="font-display text-xl font-bold tracking-tight text-white">
              Niki<span className="text-niki-orange">Mart</span>
            </span>
          </div>
          <p className="mt-3 text-sm">Shop smart. Sell faster. Deliver closer.</p>
          <p className="mt-3 text-xs text-white/40">
            Buy local. Preorder global. Shop NikiMart.
          </p>
        </div>

        {FOOTER_COLUMNS.map((column) => (
          <div key={column.title}>
            <h3 className="text-sm font-semibold text-white">{column.title}</h3>
            <ul className="mt-3 space-y-2">
              {column.links.map((link) => (
                <li key={link.href}>
                  <Link
                    href={link.href}
                    className="text-sm transition-colors hover:text-niki-orange"
                  >
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </Container>

      <div className="border-t border-white/10">
        <Container className="flex flex-col gap-3 py-5 text-xs text-white/40 sm:flex-row sm:items-center sm:justify-between">
          <p>&copy; {new Date().getFullYear()} NikiMart. All rights reserved.</p>
          <p className="max-w-xl">
            NikiMart restricts dangerous, illegal, and age-restricted products including weapons,
            alcohol, nicotine, drugs, gambling, adult content, counterfeit goods, and prescription
            medicine.
          </p>
        </Container>
      </div>
    </footer>
  );
}
