import Link from "next/link";
import { ClipboardList, HelpCircle, Store, User } from "lucide-react";
import { SearchBar } from "./SearchBar";
import { LocationSelector } from "./LocationSelector";
import { SidebarNav } from "./SidebarNav";
import { CartBadge } from "@/components/cart/CartBadge";
import { BrandLogo } from "@/components/ui/BrandLogo";
import { Container } from "@/components/ui/Container";
import { auth } from "@/lib/auth";
import { getCategories } from "@/lib/catalog";
import { getSettings } from "@/lib/settings";
import { isRole, ROLE_HOME, ROLE_LABELS } from "@/lib/roles";

export async function Header() {
  const [session, categories, settings] = await Promise.all([auth(), getCategories(), getSettings()]);
  const role = session?.user && isRole(session.user.role) ? session.user.role : null;
  const accountHref = role ? ROLE_HOME[role] : "/login";
  const accountLabel = session?.user ? "Account" : "Sign in";
  const sidebarCategories = categories.map((c) => ({ slug: c.slug, name: c.name, icon: c.icon }));

  return (
    <header className="sticky top-0 z-50 bg-niki-navy">
      <Container className="flex items-center gap-2 py-3 sm:gap-4">
        <SidebarNav accountHref={accountHref} accountLabel={accountLabel} isAuthed={Boolean(session?.user)} categories={sidebarCategories} logoSrc={settings.logoUrl} dataBundlesUrl={settings.dataBundlesUrl} />

        <Link href="/" className="flex shrink-0 items-center gap-2">
          <BrandLogo className="h-9 w-9" src={settings.logoUrl} />
          <span className="font-display text-xl font-bold tracking-tight text-white">
            Niki<span className="text-niki-orange">Mart</span>
          </span>
        </Link>

        <SearchBar className="hidden flex-1 lg:flex" />

        <div className="ml-auto flex items-center gap-1 sm:gap-2">
          <LocationSelector className="hidden md:flex" />

          <Link
            href="/help"
            className="hidden items-center gap-1 rounded-full px-2.5 py-1.5 text-sm text-white/80 transition-colors hover:bg-white/10 hover:text-white lg:flex"
          >
            <HelpCircle className="h-5 w-5" />
            <span>Help</span>
          </Link>

          <Link
            href={accountHref}
            className="flex flex-col items-center gap-0.5 rounded-xl px-2.5 py-1.5 text-white/80 transition-colors hover:bg-white/10 hover:text-white"
            aria-label={accountLabel}
          >
            <User className="h-5 w-5" />
            <span className="hidden text-[10px] font-medium sm:block">{accountLabel}</span>
          </Link>

          <Link
            href="/orders"
            className="flex flex-col items-center gap-0.5 rounded-xl px-2.5 py-1.5 text-white/80 transition-colors hover:bg-white/10 hover:text-white"
            aria-label="Orders"
          >
            <ClipboardList className="h-5 w-5" />
            <span className="hidden text-[10px] font-medium sm:block">Orders</span>
          </Link>

          <CartBadge />

          {role && role !== "CUSTOMER" ? (
            <Link
              href={accountHref}
              className="ml-1 hidden shrink-0 items-center gap-1.5 rounded-full bg-white/10 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-white/20 lg:flex"
            >
              {ROLE_LABELS[role]}
            </Link>
          ) : (
            <Link
              href="/sell"
              className="ml-1 hidden shrink-0 items-center gap-1.5 rounded-full bg-niki-orange px-4 py-2 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-niki-orange-light sm:flex"
            >
              <Store className="h-4 w-4" />
              Sell on NikiMart
            </Link>
          )}
        </div>
      </Container>

      <Container className="flex flex-col gap-2 pb-3 lg:hidden">
        <SearchBar />
        <LocationSelector className="md:hidden" />
      </Container>
    </header>
  );
}
