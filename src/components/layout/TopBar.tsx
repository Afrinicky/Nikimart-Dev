import Link from "next/link";
import { HelpCircle, MapPin, Phone, Plane, Truck } from "lucide-react";
import { Container } from "@/components/ui/Container";
import { getSettings } from "@/lib/settings";
import { isExternalStoreLink } from "@/lib/data-bundles/store-link";

/**
 * The dark strip across the very top of every page.
 *
 * The header below it is white, which is right — the brand is mostly white and
 * a shop's search bar should sit on it. But white chrome on a near-white page
 * left the top of the site with nothing to anchor it: no mass, no edge, and a
 * logo floating in a pale band. This is the weight, and it is the same answer
 * Jumia, Konga and Amazon all reach for — a slim dark utility rail above the
 * search row.
 *
 * It earns the space rather than just filling it: the left carries the real
 * support number and opening hours from Settings, and the right carries the
 * errands that were buried before — tracking an order, finding a pickup
 * point, and how any of this works.
 *
 * Not sticky. The header is what follows the reader down the page; repeating
 * this rail there would cost 36px of every screen for links nobody needs twice.
 */
export async function TopBar() {
  const settings = await getSettings();
  const bundlesHref = settings.dataBundlesUrl;

  // No "Sell on Nickimart" here: the header carries that as its one orange
  // button, and the same call to action twice within 40px of itself reads as a
  // mistake rather than emphasis.
  const links = [
    { label: "Shipped from Abroad", href: "/shipped-from-abroad", icon: Plane },
    { label: "Track order", href: "/order-tracking", icon: Truck },
    { label: "Pickup points", href: "/pickup-points", icon: MapPin },
    ...(bundlesHref ? [{ label: "Buy data", href: bundlesHref, icon: null }] : []),
    { label: "How it works", href: "/how-it-works", icon: HelpCircle },
  ];

  return (
    <div className="bg-niki-black text-white/70">
      <Container className="flex h-9 items-center justify-between gap-4 text-xs">
        {/* Real contact details, not decoration — and the first thing a wary
            buyer looks for. Hidden on the narrowest screens, where the links
            are the better use of the row. */}
        <div className="hidden min-w-0 items-center gap-4 sm:flex">
          {settings.supportPhone ? (
            <a
              href={`tel:${settings.supportPhone.replace(/\s+/g, "")}`}
              className="flex items-center gap-1.5 whitespace-nowrap transition-colors hover:text-white"
            >
              <Phone className="h-3.5 w-3.5 text-niki-orange" />
              {settings.supportPhone}
            </a>
          ) : null}
          {settings.businessHours ? (
            <span className="hidden truncate text-white/45 lg:inline">{settings.businessHours}</span>
          ) : null}
        </div>

        <nav className="scrollbar-none -mx-1 flex min-w-0 flex-1 items-center justify-start gap-1 overflow-x-auto sm:flex-none sm:justify-end">
          {links.map(({ label, href, icon: Icon }) => {
            const className =
              "flex shrink-0 items-center gap-1.5 rounded-md px-2 py-1 whitespace-nowrap transition-colors hover:bg-white/10 hover:text-white";
            const body = (
              <>
                {Icon ? <Icon className="h-3.5 w-3.5" /> : null}
                {label}
              </>
            );
            return isExternalStoreLink(href) ? (
              <a key={label} href={href} target="_blank" rel="noopener noreferrer" className={className}>
                {body}
              </a>
            ) : (
              <Link key={label} href={href} className={className}>
                {body}
              </Link>
            );
          })}
        </nav>
      </Container>
    </div>
  );
}
