import Link from "next/link";
import { ClipboardList, HelpCircle, Plane } from "lucide-react";
import { SearchBar } from "./SearchBar";
import { LocationSelector } from "./LocationSelector";
import { SidebarNav } from "./SidebarNav";
import { AccountLink, RoleOrSellButton } from "./AccountActions";
import { CartBadge } from "@/components/cart/CartBadge";
import { BrandLogo } from "@/components/ui/BrandLogo";
import { Container } from "@/components/ui/Container";
import { getCategories } from "@/lib/catalog";
import { getSettings } from "@/lib/settings";

/** Icon-over-label header actions all share this. */
const ACTION =
  "flex flex-col items-center gap-0.5 rounded-xl px-2 py-1.5 text-niki-ink/80 transition-colors hover:bg-niki-ink/[0.07] hover:text-niki-ink sm:px-2.5";

/**
 * The site header.
 *
 * White, like the shops people already use here. It was a solid dark bar,
 * which put the heaviest element on the page permanently across the top and
 * left the mark — orange on near-black — as the lowest-contrast thing in it.
 * The brand's own weighting is mostly white, one orange accent, black for
 * text, and the header follows it: white ground, black wordmark and controls,
 * orange kept for the two things a visitor is meant to act on, the search
 * button and "Sell on Nickimart".
 *
 * A white bar on a near-white page has no edge of its own, so the separation
 * is drawn explicitly (see .niki-header-edge) — without it the sticky header
 * slides over the page with nothing between the two.
 */
export async function Header() {
  // No session read here, deliberately. The account link and the role chip are
  // client islands (see AccountActions) because reading the session on the
  // server reads cookies, and one dynamic API in the root layout makes every
  // route on the site dynamic — which is what stopped any page being cached.

  const [categories, settings] = await Promise.all([getCategories(), getSettings()]);
  const sidebarCategories = categories.map((c) => ({ slug: c.slug, name: c.name, icon: c.icon }));

  return (
    <header className="niki-header-edge sticky top-0 z-50 bg-white">
      <Container className="flex items-center gap-2 py-3 sm:gap-4">
        <SidebarNav categories={sidebarCategories} logoSrc={settings.logoUrl} dataBundlesUrl={settings.dataBundlesUrl} />

        <Link href="/" className="flex shrink-0 items-center gap-2" aria-label="Nickimart home">
          <BrandLogo className="h-8 w-auto text-niki-orange" src={settings.logoUrl} />
          {/* A step smaller on the narrowest phones. At 320px the header row
              was 1.6px wider than the screen, which is all it takes: the phone
              zooms the whole page out to fit, and every fixed element then
              renders at a fraction of the width. */}
          <span className="font-display text-lg font-extrabold tracking-tight text-niki-ink sm:text-xl">
            Nick<span className="text-niki-orange">imart</span>
          </span>
        </Link>

        {/* Finding a product is the main thing people come here to do, so the
            search bar takes the leftover width rather than sitting at its
            minimum. It could not before: the actions below claimed the free
            space with `ml-auto`, which beats `flex-1`, and the field collapsed
            to about the width of its own button. `justify-end` on the actions
            keeps them right-aligned without competing for the space. */}
        <SearchBar className="hidden min-w-0 grow lg:flex lg:basis-64 xl:basis-96" />

        <div className="flex flex-1 items-center justify-end gap-1 sm:gap-2 lg:flex-none">
          <LocationSelector className="hidden md:flex" />

          {/* The one storefront section that isn't reachable by browsing: an
              imported listing looks like any other product in the catalogue,
              so without a way in, the whole section is invisible. */}
          <Link
            href="/shipped-from-abroad"
            className="hidden items-center gap-1.5 rounded-full px-2.5 py-1.5 text-sm font-medium text-niki-ink/80 transition-colors hover:bg-niki-ink/[0.07] hover:text-niki-ink lg:flex"
          >
            <Plane className="h-5 w-5" />
            <span className="hidden whitespace-nowrap xl:inline">From Abroad</span>
          </Link>

          <Link
            href="/help"
            className="hidden items-center gap-1 rounded-full px-2.5 py-1.5 text-sm font-medium text-niki-ink/80 transition-colors hover:bg-niki-ink/[0.07] hover:text-niki-ink lg:flex"
          >
            <HelpCircle className="h-5 w-5" />
            <span className="hidden xl:inline">Help</span>
          </Link>

          {/* Hidden on phones: the bottom nav already has Account, and three
              icon buttons plus the wordmark do not fit a 320px screen. */}
          <AccountLink className={`hidden sm:flex ${ACTION}`} />

          <Link href="/orders" className={ACTION} aria-label="Orders">
            <ClipboardList className="h-5 w-5" />
            <span className="hidden text-[10px] font-medium sm:block">Orders</span>
          </Link>

          <CartBadge />

          <RoleOrSellButton />
        </div>
      </Container>

      <Container className="flex flex-col gap-2 pb-3 lg:hidden">
        <SearchBar />
        <LocationSelector className="md:hidden" />
      </Container>
    </header>
  );
}
