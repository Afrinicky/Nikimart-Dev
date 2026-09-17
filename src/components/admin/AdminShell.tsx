"use client";

import { useCallback, useState, useSyncExternalStore } from "react";
import { usePathname } from "next/navigation";
import {
  BadgeCheck,
  Banknote,
  ChevronLeft,
  ClipboardList,
  GalleryHorizontalEnd,
  HelpCircle,
  LayoutDashboard,
  LayoutGrid,
  LayoutTemplate,
  ListOrdered,
  MapPin,
  Menu,
  Package,
  PackageCheck,
  Scale,
  Settings,
  Settings2,
  Share2,
  ShoppingBag,
  Signal,
  Store,
  Tags,
  Trophy,
  Truck,
  Users,
  Wallet,
  Gift,
  X,
} from "lucide-react";
import { ActionLink } from "@/components/ui/motion";
import { BrandLogo } from "@/components/ui/BrandLogo";
import { LogoutButton } from "@/components/auth/LogoutButton";
import { cn } from "@/lib/cn";

/**
 * The admin console's frame: a sidebar down the left, a bar across the top,
 * and the page in the space that is left.
 *
 * It replaces two stacked rows of pills. Nineteen retail sections and twelve
 * bundle ones in horizontal scrollers meant the console's own navigation
 * scrolled sideways on a laptop — you could not see where you were without
 * dragging, and nothing showed how the two businesses related. A vertical list
 * has room for every section at once, and the two consoles become what they
 * are: two groups in one list, not one tab hiding inside the other.
 *
 * Collapsing is remembered per browser. Somebody working a wide table all day
 * wants the 200px back; somebody learning the console wants the words. Neither
 * should have to say so twice.
 */

interface NavItem {
  href: string;
  label: string;
  icon: React.ElementType;
  exact?: boolean;
}

const RETAIL: NavItem[] = [
  { href: "/admin", label: "Overview", icon: LayoutDashboard, exact: true },
  { href: "/admin/products", label: "Products", icon: Package },
  { href: "/admin/vendors", label: "Shops", icon: Store },
  { href: "/admin/categories", label: "Categories", icon: LayoutGrid },
  { href: "/admin/users", label: "Users", icon: Users },
  { href: "/admin/orders", label: "Orders", icon: ShoppingBag },
  { href: "/admin/finance", label: "Finance", icon: Wallet },
  { href: "/admin/affiliates", label: "Affiliates", icon: Gift },
  { href: "/admin/purchasing", label: "Order placement", icon: ClipboardList },
  { href: "/admin/shipping", label: "Shipping", icon: Truck },
  { href: "/admin/shipping/locations", label: "Pickup points", icon: PackageCheck },
  { href: "/admin/locations", label: "Locations", icon: MapPin },
  { href: "/admin/pages", label: "Pages", icon: LayoutTemplate },
  { href: "/admin/banners", label: "Carousel", icon: GalleryHorizontalEnd },
  { href: "/admin/faqs", label: "FAQs", icon: HelpCircle },
  { href: "/admin/legal", label: "Policies", icon: Scale },
];

const DATA: NavItem[] = [
  { href: "/admin/data", label: "Overview", icon: LayoutDashboard, exact: true },
  { href: "/admin/data/bundles", label: "Bundle prices", icon: Tags },
  { href: "/admin/data/orders", label: "Bundle orders", icon: ListOrdered },
  { href: "/admin/data/topup", label: "Buy data", icon: ShoppingBag },
  { href: "/admin/data/afa", label: "AFA", icon: BadgeCheck },
  { href: "/admin/data/agents", label: "Agents", icon: Users },
  { href: "/admin/data/referrals", label: "Referrals", icon: Share2 },
  { href: "/admin/data/leaderboard", label: "Leaderboard", icon: Trophy },
  { href: "/admin/data/withdrawals", label: "Withdrawals", icon: Banknote },
  { href: "/admin/data/settings", label: "Store settings", icon: Settings2 },
];

const SETTINGS: NavItem = { href: "/admin/settings", label: "Settings", icon: Settings };

/** True when this path belongs to the data-bundle console. */
export function isDataConsole(pathname: string): boolean {
  return pathname === "/admin/data" || pathname.startsWith("/admin/data/");
}

function isActive(pathname: string, item: NavItem): boolean {
  if (item.exact) return pathname === item.href;
  if (pathname === item.href) return true;
  if (!pathname.startsWith(`${item.href}/`)) return false;
  // "/admin/shipping" must not light up on "/admin/shipping/locations" when
  // that has an entry of its own — the deeper match wins.
  const siblings = [...RETAIL, ...DATA].filter(
    (other) => other.href !== item.href && other.href.startsWith(`${item.href}/`),
  );
  return !siblings.some((s) => pathname === s.href || pathname.startsWith(`${s.href}/`));
}

const STORAGE_KEY = "niki-admin-sidebar";

/**
 * Whether the sidebar is collapsed, kept outside React.
 *
 * It has to be read from localStorage, which the server cannot see, and a
 * server-rendered "open" that flips to "collapsed" in an effect is a layout
 * that jumps on every page load. useSyncExternalStore is the shape React has
 * for exactly this: one snapshot for the server, one for the browser, and no
 * render cascade between them.
 */
const sidebarStore = {
  listeners: new Set<() => void>(),
  subscribe(listener: () => void) {
    sidebarStore.listeners.add(listener);
    return () => sidebarStore.listeners.delete(listener);
  },
  get(): boolean {
    try {
      return window.localStorage.getItem(STORAGE_KEY) === "collapsed";
    } catch {
      return false; // storage blocked — the default is fine
    }
  },
  set(collapsed: boolean) {
    try {
      window.localStorage.setItem(STORAGE_KEY, collapsed ? "collapsed" : "open");
    } catch {
      // Not worth failing a click over; the state below still moves.
    }
    sidebarStore.override = collapsed;
    sidebarStore.listeners.forEach((l) => l());
  },
  /** What the last click asked for, so a blocked write still takes effect. */
  override: null as boolean | null,
};

function readCollapsed(): boolean {
  return sidebarStore.override ?? sidebarStore.get();
}

export function AdminShell({
  user,
  children,
}: {
  user: { name: string | null; email: string | null };
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const onData = isDataConsole(pathname);
  // The server renders it open; the browser corrects to whatever this person
  // last chose, in one pass rather than a second render.
  const collapsed = useSyncExternalStore(
    sidebarStore.subscribe,
    readCollapsed,
    () => false,
  );
  const toggle = useCallback(() => sidebarStore.set(!readCollapsed()), []);

  // The drawer is open *for a page*, so navigating closes it without an effect
  // watching the path to do it.
  const [openFor, setOpenFor] = useState<string | null>(null);
  const mobileOpen = openFor === pathname;
  const closeDrawer = useCallback(() => setOpenFor(null), []);

  const items = onData ? DATA : RETAIL;
  const who = user.name ?? user.email ?? "Admin";

  return (
    <div className="min-h-screen bg-niki-surface">
      {/* The drawer's scrim, on small screens only. */}
      {mobileOpen ? (
        <button
          type="button"
          aria-label="Close menu"
          onClick={closeDrawer}
          className="animate-fade-in fixed inset-0 z-40 bg-niki-black/60 lg:hidden"
        />
      ) : null}

      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-50 flex flex-col bg-niki-black text-white transition-[width,transform] duration-200 ease-out",
          collapsed ? "w-[76px]" : "w-[248px]",
          mobileOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0",
        )}
      >
        {/* Brand */}
        <div className={cn("flex items-center gap-2.5 px-4 py-5", collapsed && "justify-center px-2")}>
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-white/10 text-niki-orange">
            <BrandLogo className="h-5 w-auto" />
          </span>
          {!collapsed ? (
            <div className="min-w-0">
              <p className="truncate font-display text-sm font-bold leading-tight">Admin Console</p>
              <p className="truncate text-[11px] leading-tight text-white/45">
                {onData ? "Data bundles" : "Retail services"}
              </p>
            </div>
          ) : null}
          <button
            type="button"
            onClick={closeDrawer}
            aria-label="Close menu"
            className="ml-auto rounded-lg p-1.5 text-white/60 hover:bg-white/10 lg:hidden"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Collapse control — the screenshot's "Minimize", kept on the left rail
            where it belongs rather than in the page chrome. */}
        <button
          type="button"
          onClick={toggle}
          aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          className={cn(
            "mx-3 mb-3 hidden items-center gap-1.5 rounded-lg border border-white/10 px-2.5 py-1.5 text-[11px] font-semibold text-white/50 transition-colors hover:bg-white/10 hover:text-white lg:flex",
            collapsed && "justify-center px-0",
          )}
        >
          <ChevronLeft className={cn("h-3.5 w-3.5 transition-transform", collapsed && "rotate-180")} />
          {!collapsed ? "Minimize" : null}
        </button>

        {/* The two businesses, as two ways in rather than a tab inside one. */}
        <div className={cn("space-y-1 px-3 pb-3", collapsed && "px-2")}>
          <ConsoleLink
            href="/admin"
            icon={Store}
            label="Retail"
            active={!onData}
            collapsed={collapsed}
          />
          <ConsoleLink
            href="/admin/data"
            icon={Signal}
            label="Data bundles"
            active={onData}
            collapsed={collapsed}
          />
        </div>

        <nav className="scrollbar-none flex-1 overflow-y-auto px-3 pb-4">
          {!collapsed ? (
            <p className="px-3 pb-2 pt-3 text-[10px] font-semibold uppercase tracking-[0.12em] text-white/35">
              Main menu
            </p>
          ) : (
            <div className="my-3 border-t border-white/10" />
          )}
          <ul className="space-y-0.5">
            {items.map((item) => (
              <li key={item.href}>
                <NavLink item={item} active={isActive(pathname, item)} collapsed={collapsed} />
              </li>
            ))}
          </ul>

          {!onData ? (
            <>
              {!collapsed ? (
                <p className="px-3 pb-2 pt-5 text-[10px] font-semibold uppercase tracking-[0.12em] text-white/35">
                  System
                </p>
              ) : (
                <div className="my-3 border-t border-white/10" />
              )}
              <NavLink
                item={SETTINGS}
                active={isActive(pathname, SETTINGS)}
                collapsed={collapsed}
              />
            </>
          ) : null}
        </nav>

        <div className={cn("border-t border-white/10 p-3", collapsed && "px-2")}>
          <LogoutButton
            className={cn(
              "flex w-full items-center gap-2.5 rounded-lg px-3 py-2.5 text-sm font-semibold text-white/60 transition-colors hover:bg-white/10 hover:text-white",
              collapsed && "justify-center px-0",
            )}
            label={collapsed ? "" : "Log out"}
          />
        </div>
      </aside>

      <div
        className={cn(
          "flex min-h-screen flex-col transition-[padding] duration-200 ease-out",
          collapsed ? "lg:pl-[76px]" : "lg:pl-[248px]",
        )}
      >
        <header className="sticky top-0 z-30 border-b border-niki-edge bg-white/90 backdrop-blur">
          <div className="flex items-center gap-3 px-4 py-3.5 sm:px-6">
            <button
              type="button"
              onClick={() => setOpenFor(pathname)}
              aria-label="Open menu"
              className="niki-press rounded-lg p-2 text-niki-ink/60 ring-1 ring-niki-edge hover:bg-niki-black/5 lg:hidden"
            >
              <Menu className="h-5 w-5" />
            </button>

            <div className="min-w-0">
              <p className="truncate font-display text-base font-bold text-niki-ink">
                Welcome back, {who.split(" ")[0]}
              </p>
              <p className="truncate text-xs text-niki-ink/50">
                {onData ? "Data bundles console" : "Retail services console"}
              </p>
            </div>

            <div className="ml-auto flex items-center gap-2.5">
              <span className="hidden text-right sm:block">
                <span className="block text-sm font-semibold leading-tight text-niki-ink">{who}</span>
                <span className="block text-[11px] leading-tight text-niki-ink/45">Administrator</span>
              </span>
              <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-niki-black text-sm font-bold text-niki-orange">
                {who.slice(0, 1).toUpperCase()}
              </span>
            </div>
          </div>
        </header>

        <main className="flex-1">{children}</main>
      </div>
    </div>
  );
}

function NavLink({
  item,
  active,
  collapsed,
}: {
  item: NavItem;
  active: boolean;
  collapsed: boolean;
}) {
  const Icon = item.icon;
  return (
    <ActionLink
      href={item.href}
      aria-current={active ? "page" : undefined}
      title={collapsed ? item.label : undefined}
      className={cn(
        "flex items-center gap-2.5 rounded-lg px-3 py-2.5 text-sm font-semibold transition-colors",
        active ? "bg-niki-orange text-white" : "text-white/60 hover:bg-white/10 hover:text-white",
        collapsed && "justify-center px-0",
      )}
    >
      <Icon className="h-4 w-4 shrink-0" />
      {!collapsed ? <span className="truncate">{item.label}</span> : null}
    </ActionLink>
  );
}

function ConsoleLink({
  href,
  icon: Icon,
  label,
  active,
  collapsed,
}: {
  href: string;
  icon: React.ElementType;
  label: string;
  active: boolean;
  collapsed: boolean;
}) {
  return (
    <ActionLink
      href={href}
      aria-current={active ? "page" : undefined}
      title={collapsed ? label : undefined}
      className={cn(
        "flex items-center gap-2.5 rounded-lg px-3 py-2 text-xs font-semibold transition-colors",
        active
          ? "bg-white/12 text-white ring-1 ring-white/15"
          : "text-white/45 hover:bg-white/8 hover:text-white/80",
        collapsed && "justify-center px-0",
      )}
    >
      <Icon className={cn("h-4 w-4 shrink-0", active && "text-niki-orange")} />
      {!collapsed ? <span className="truncate">{label}</span> : null}
    </ActionLink>
  );
}
