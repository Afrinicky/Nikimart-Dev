import Link from "next/link";
import { Container } from "@/components/ui/Container";
import { BrandLogo } from "@/components/ui/BrandLogo";
import { getSettings } from "@/lib/settings";

const FOOTER_COLUMNS: { title: string; links: { label: string; href: string }[] }[] = [
  {
    title: "Shop",
    links: [
      { label: "All Products", href: "/products" },
      { label: "Global Shopping", href: "/global-shopping" },
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
      { label: "How It Works", href: "/how-it-works" },
      { label: "Track an Order", href: "/order-tracking" },
      { label: "Pickup Points", href: "/pickup-points" },
      { label: "Buyer Protection", href: "/buyer-protection" },
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

export async function Footer() {
  const settings = await getSettings();
  return (
    <footer className="bg-niki-navy pb-16 text-white/70 sm:pb-0">
      <Container className="grid grid-cols-2 gap-8 py-12 sm:grid-cols-4 lg:grid-cols-5">
        <div className="col-span-2 sm:col-span-4 lg:col-span-1">
          <div className="flex items-center gap-2">
            <BrandLogo className="h-9 w-9" src={settings.logoUrl} />
            <span className="font-display text-xl font-bold tracking-tight text-white">
              Niki<span className="text-niki-orange">Mart</span>
            </span>
          </div>
          <p className="mt-3 text-sm">{settings.footerTagline}</p>
          <p className="mt-3 text-xs text-white/40">{settings.footerNote}</p>
          <p className="mt-3 text-xs text-white/50">
            {settings.supportEmail} · {settings.supportPhone}
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
          <p>
            &copy; {new Date().getFullYear()} {settings.copyrightName}. All rights reserved.
          </p>
          <p className="max-w-xl">{settings.restrictionsText}</p>
        </Container>
      </div>
    </footer>
  );
}
