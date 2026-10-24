"use client";

import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import {
  ChevronDown,
  FileText,
  Heart,
  Mail,
  Menu,
  Phone,
  User,
  X,
} from "lucide-react";
import { MedicalLink } from "@/components/medical/ui/MedicalLink";
import { MedicalLogo } from "@/components/medical/ui/MedicalLogo";
import { MedicalButtonLink } from "@/components/medical/ui/MedicalButton";
import { SearchField } from "@/components/medical/layout/SearchField";
import { CatalogueMenu } from "@/components/medical/layout/CatalogueMenu";
import { BasketCounts } from "@/components/medical/layout/BasketCounts";
import { categoryIcon } from "@/lib/medical/icons";
import type { CategoryNode } from "@/lib/medical/categories";
import { cn } from "@/lib/cn";

/**
 * Two rows, not three.
 *
 * The obvious catalogue header is a utility strip, a logo-and-search row, and
 * a navigation bar — which is fifteen percent of a phone's viewport spent on
 * chrome before a single product. So: a slim utility strip that scrolls away
 * carrying the two things a buyer actually wants from it (a phone number and
 * an email address, because institutional buyers ring), and one sticky row
 * holding the logo, search, the catalogue menu and the basket.
 *
 * The strip says nothing about trust, shipping or hours. The reference design
 * fills that space with "Trusted by 5,000+ professionals" and "Free shipping
 * over $199", neither of which this business can presently stand behind, and
 * an unverifiable claim in the first eighty pixels of a medical supplier's
 * site costs more credibility than it buys.
 */

const NAV = [
  { href: "/medicals/quotations/new", label: "Request a quotation" },
  { href: "/medicals/about", label: "About" },
  { href: "/medicals/support", label: "Contact" },
];

export function MedicalHeader({ categories }: { categories: CategoryNode[] }) {
  const pathname = usePathname();

  /**
   * Which page each panel was opened on, rather than whether it is open.
   *
   * Any navigation has to close both — otherwise following a category link
   * from the mega menu leaves the panel sitting over the page it just opened.
   * The obvious way to do that is an effect on `pathname` that calls two
   * setters, but that is a cascading render on every navigation, and the bad
   * frame is the one that happens *before* the effect runs: the new page
   * paints with the old panel still over it.
   *
   * Storing the path instead makes "open" a derived value. A navigation
   * changes `pathname`, the comparison stops matching, and both panels are
   * closed in the same render that shows the new page. No effect, no flash.
   */
  const [menuOpenOn, setMenuOpenOn] = useState<string | null>(null);
  const [mobileOpenOn, setMobileOpenOn] = useState<string | null>(null);
  const menuOpen = menuOpenOn === pathname;
  const mobileOpen = mobileOpenOn === pathname;

  const setMenuOpen = useCallback(
    (open: boolean) => setMenuOpenOn(open ? pathname : null),
    [pathname],
  );
  const setMobileOpen = useCallback(
    (open: boolean) => setMobileOpenOn(open ? pathname : null),
    [pathname],
  );

  // A drawer that leaves the page scrolling behind it reads as a rendering
  // fault on a phone, where the drawer is the whole screen.
  useEffect(() => {
    if (!mobileOpen) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, [mobileOpen]);

  return (
    <header className="medi-z-sticky sticky top-0">
      <UtilityStrip />

      <div className="medi-header-edge bg-white">
        <div className="mx-auto flex h-[4.5rem] max-w-[80rem] items-center gap-3 px-4 sm:gap-5 sm:px-6 lg:px-8">
          <button
            type="button"
            onClick={() => setMobileOpen(true)}
            aria-label="Open menu"
            aria-expanded={mobileOpen}
            className="medi-focus medi-press -ml-1 flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-medi-ink hover:bg-medi-mint-50 lg:hidden"
          >
            <Menu className="h-5 w-5" aria-hidden />
          </button>

          <MedicalLink href="/medicals" className="shrink-0 rounded-lg" aria-label="Nickimart Medical, home">
            <MedicalLogo />
          </MedicalLink>

          <div className="ml-auto hidden min-w-0 flex-1 justify-center lg:flex">
            <Suspense fallback={<div className="h-11 w-full max-w-xl" />}>
              <SearchField className="w-full max-w-xl" />
            </Suspense>
          </div>

          <div className="ml-auto flex items-center gap-1 lg:ml-0">
            <MedicalLink
              href="/medicals/account"
              className="medi-focus hidden h-11 items-center gap-2 rounded-xl px-3 text-sm font-semibold text-medi-ink hover:bg-medi-mint-50 sm:flex"
            >
              <User className="h-[1.125rem] w-[1.125rem]" aria-hidden />
              <span className="hidden xl:inline">Account</span>
            </MedicalLink>

            <MedicalLink
              href="/medicals/account/saved"
              aria-label="Saved products"
              className="medi-focus hidden h-11 w-11 items-center justify-center rounded-xl text-medi-ink hover:bg-medi-mint-50 sm:flex"
            >
              <Heart className="h-[1.125rem] w-[1.125rem]" aria-hidden />
            </MedicalLink>

            <BasketCounts />
          </div>
        </div>

        {/* The catalogue menu trigger and the three nav links. Desktop only —
            on a phone all of it lives in the drawer, because a row of links
            that scrolls sideways is a row nobody reads the end of. */}
        <div className="hidden border-t border-medi-rule lg:block">
          <div className="mx-auto flex max-w-[80rem] items-center gap-1 px-4 sm:px-6 lg:px-8">
            <button
              type="button"
              onClick={() => setMenuOpen(!menuOpen)}
              aria-expanded={menuOpen}
              aria-controls="medi-catalogue-menu"
              className={cn(
                "medi-focus medi-press -ml-3 flex h-12 items-center gap-2 rounded-lg px-3 text-sm font-semibold transition-colors",
                menuOpen ? "text-medi-teal-700" : "text-medi-ink hover:text-medi-teal-700",
              )}
            >
              Browse the catalogue
              <ChevronDown
                className={cn("h-4 w-4 transition-transform duration-200", menuOpen && "rotate-180")}
                aria-hidden
              />
            </button>

            <span className="mx-2 h-5 w-px bg-medi-rule" aria-hidden />

            {NAV.map((item) => (
              <MedicalLink
                key={item.href}
                href={item.href}
                className={cn(
                  "medi-focus flex h-12 items-center rounded-lg px-3 text-sm font-medium transition-colors",
                  pathname.startsWith(item.href)
                    ? "text-medi-teal-700"
                    : "text-medi-body hover:text-medi-ink",
                )}
              >
                {item.label}
              </MedicalLink>
            ))}
          </div>

          <CatalogueMenu
            id="medi-catalogue-menu"
            categories={categories}
            open={menuOpen}
            onClose={() => setMenuOpen(false)}
          />
        </div>
      </div>

      <MobileDrawer
        open={mobileOpen}
        onClose={() => setMobileOpen(false)}
        categories={categories}
      />
    </header>
  );
}

/**
 * The strip above the header. Contact details, because a procurement officer
 * with a list of forty line items picks up the phone, and a supplier whose
 * number is three clicks deep is a supplier they call second.
 */
function UtilityStrip() {
  return (
    <div className="hidden bg-medi-teal-900 text-white/90 md:block">
      <div className="mx-auto flex h-9 max-w-[80rem] items-center justify-between px-4 text-[0.75rem] sm:px-6 lg:px-8">
        <div className="flex items-center gap-5">
          <a
            href="tel:+233200000000"
            className="medi-focus flex items-center gap-1.5 rounded transition-colors hover:text-white"
          >
            <Phone className="h-3.5 w-3.5" aria-hidden />
            <span className="font-figures">+233 20 000 0000</span>
          </a>
          <a
            href="mailto:medical@nickimart.com"
            className="medi-focus flex items-center gap-1.5 rounded transition-colors hover:text-white"
          >
            <Mail className="h-3.5 w-3.5" aria-hidden />
            medical@nickimart.com
          </a>
        </div>
        <div className="flex items-center gap-5">
          <MedicalLink href="/medicals/orders/track" className="rounded transition-colors hover:text-white">
            Track an order
          </MedicalLink>
          <MedicalLink href="/medicals/support" className="rounded transition-colors hover:text-white">
            Help
          </MedicalLink>
        </div>
      </div>
    </div>
  );
}

/**
 * The phone drawer: search first, then the whole category tree, then the nav.
 *
 * Search first because that is what the control is for. A drawer that opens on
 * a list of twelve categories makes somebody who knows the part number scroll
 * past all of them.
 */
function MobileDrawer({
  open,
  onClose,
  categories,
}: {
  open: boolean;
  onClose: () => void;
  categories: CategoryNode[];
}) {
  const panel = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey);
    // Focus moves into the drawer so a keyboard or screen-reader user is
    // actually taken there, rather than left tabbing through the page behind.
    panel.current?.focus();
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="lg:hidden">
      <button
        type="button"
        aria-label="Close menu"
        onClick={onClose}
        className="medi-z-drawer-backdrop animate-fade-in fixed inset-0 bg-medi-ink/45"
      />
      <div
        ref={panel}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-label="Menu"
        className="medi-z-drawer animate-sheet-up fixed inset-y-0 left-0 flex w-[min(21rem,88vw)] flex-col bg-white outline-none"
      >
        <div className="flex h-[4.5rem] shrink-0 items-center justify-between border-b border-medi-rule px-4">
          <MedicalLogo />
          <button
            type="button"
            onClick={onClose}
            aria-label="Close menu"
            className="medi-focus medi-press flex h-11 w-11 items-center justify-center rounded-xl text-medi-ink hover:bg-medi-mint-50"
          >
            <X className="h-5 w-5" aria-hidden />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto overscroll-contain px-4 py-4">
          <Suspense fallback={<div className="h-11" />}>
            <SearchField onSubmitted={onClose} />
          </Suspense>

          <MedicalButtonLink
            href="/medicals/quotations/new"
            variant="ghost"
            className="mt-3 w-full"
            onClick={onClose}
          >
            <FileText className="h-4 w-4" aria-hidden />
            Request a quotation
          </MedicalButtonLink>

          <p className="medi-label mt-6 px-1 text-medi-muted">Catalogue</p>
          <ul className="mt-2 space-y-0.5">
            {categories.map((category) => {
              const Icon = categoryIcon(category.icon);
              return (
                <li key={category.id}>
                  <MedicalLink
                    href={`/medicals/categories/${category.slug}`}
                    onClick={onClose}
                    className="medi-focus flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium text-medi-ink hover:bg-medi-mint-50"
                  >
                    <Icon className="h-[1.125rem] w-[1.125rem] shrink-0 text-medi-teal-600" aria-hidden />
                    <span className="flex-1">{category.name}</span>
                    <span className="font-figures text-xs text-medi-muted">
                      {category.productCount}
                    </span>
                  </MedicalLink>
                </li>
              );
            })}
          </ul>

          <p className="medi-label mt-6 px-1 text-medi-muted">Nickimart Medical</p>
          <ul className="mt-2 space-y-0.5">
            {[...NAV, { href: "/medicals/account", label: "Your account" }].map((item) => (
              <li key={item.href}>
                <MedicalLink
                  href={item.href}
                  onClick={onClose}
                  className="medi-focus block rounded-xl px-3 py-2.5 text-sm font-medium text-medi-ink hover:bg-medi-mint-50"
                >
                  {item.label}
                </MedicalLink>
              </li>
            ))}
          </ul>
        </div>

        <div className="shrink-0 border-t border-medi-rule px-4 py-4">
          <a
            href="tel:+233200000000"
            className="medi-focus flex items-center gap-2 text-sm font-semibold text-medi-ink"
          >
            <Phone className="h-4 w-4 text-medi-teal-600" aria-hidden />
            <span className="font-figures">+233 20 000 0000</span>
          </a>
        </div>
      </div>
    </div>
  );
}
