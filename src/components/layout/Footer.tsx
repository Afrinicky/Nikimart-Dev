import Link from "next/link";
import { MessageCircle } from "lucide-react";
import { Container } from "@/components/ui/Container";
import { BrandLogo } from "@/components/ui/BrandLogo";
import { FacebookIcon, InstagramIcon, TiktokIcon, XIcon, YoutubeIcon } from "@/components/share/SocialIcons";
import { getSettings } from "@/lib/settings";
import { isExternalStoreLink } from "@/lib/data-bundles/store-link";

const FOOTER_COLUMNS: { title: string; links: { label: string; href: string }[] }[] = [
  {
    title: "Shop",
    links: [
      { label: "All Products", href: "/products" },
      { label: "Global Shopping", href: "/global-shopping" },
      { label: "Preorder Deals", href: "/preorders" },
      { label: "Services", href: "/services" },
      { label: "Shop by Campus", href: "/campus" },
      { label: "Nickimart Official Store", href: "/categories/nikimart-official-store" },
    ],
  },
  {
    title: "Sell",
    links: [
      { label: "Sell on Nickimart", href: "/sell" },
      { label: "Vendor Registration", href: "/vendor-register" },
      { label: "Seller Dashboard", href: "/seller" },
      { label: "Become an Affiliate", href: "/affiliate" },
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
  // Inject the external "Buy Data Bundles" link into the Shop column when set.
  const columns = FOOTER_COLUMNS.map((c) =>
    c.title === "Shop" && settings.dataBundlesUrl
      ? { ...c, links: [...c.links, { label: "Buy Data Bundles", href: settings.dataBundlesUrl }] }
      : c,
  );
  return (
    <footer className="bg-niki-navy pb-16 text-white/70 sm:pb-0">
      <Container className="grid grid-cols-2 gap-8 py-12 sm:grid-cols-4 lg:grid-cols-5">
        <div className="col-span-2 sm:col-span-4 lg:col-span-1">
          <div className="flex items-center gap-2">
            <BrandLogo className="h-9 w-9" src={settings.logoUrl} />
            <span className="font-display text-xl font-bold tracking-tight text-white">
              Nick<span className="text-niki-orange">imart</span>
            </span>
          </div>
          <p className="mt-3 text-sm">{settings.footerTagline}</p>
          <p className="mt-3 text-xs text-white/40">{settings.footerNote}</p>
          <p className="mt-3 text-xs text-white/50">
            {settings.supportEmail} · {settings.supportPhone}
          </p>
          {(() => {
            const socials = [
              { href: settings.socialFacebook, icon: FacebookIcon, label: "Facebook" },
              { href: settings.socialInstagram, icon: InstagramIcon, label: "Instagram" },
              { href: settings.socialTwitter, icon: XIcon, label: "X" },
              { href: settings.socialTiktok, icon: TiktokIcon, label: "TikTok" },
              { href: settings.socialYoutube, icon: YoutubeIcon, label: "YouTube" },
              { href: settings.socialWhatsapp, icon: MessageCircle, label: "WhatsApp" },
            ].filter((s) => s.href);
            return socials.length > 0 ? (
              <div className="mt-4 flex flex-wrap gap-2">
                {socials.map((s) => (
                  <a
                    key={s.label}
                    href={s.href}
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-label={s.label}
                    className="flex h-9 w-9 items-center justify-center rounded-full bg-white/10 text-white/80 transition-colors hover:bg-niki-orange hover:text-white"
                  >
                    <s.icon className="h-4 w-4" />
                  </a>
                ))}
              </div>
            ) : null;
          })()}
        </div>

        {columns.map((column) => (
          <div key={column.title}>
            <h3 className="text-sm font-semibold text-white">{column.title}</h3>
            <ul className="mt-3 space-y-2">
              {column.links.map((link) => (
                <li key={link.href}>
                  {isExternalStoreLink(link.href) ? (
                    <a
                      href={link.href}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-sm transition-colors hover:text-niki-orange"
                    >
                      {link.label}
                    </a>
                  ) : (
                    <Link
                      href={link.href}
                      className="text-sm transition-colors hover:text-niki-orange"
                    >
                      {link.label}
                    </Link>
                  )}
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
