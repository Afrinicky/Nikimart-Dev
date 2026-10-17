"use client";

import { useCallback, useState, useSyncExternalStore } from "react";
import { usePathname } from "next/navigation";
import {
  BarChart3,
  ChevronLeft,
  ClipboardCheck,
  ExternalLink,
  Gift,
  Headset,
  LayoutDashboard,
  LifeBuoy,
  ListOrdered,
  Menu,
  MessagesSquare,
  MoreHorizontal,
  MousePointerClick,
  MessageCircle,
  Network,
  Receipt,
  Settings,
  ShoppingBag,
  Store,
  Tags,
  Users,
  Wallet,
  X,
} from "lucide-react";
import { ActionLink } from "@/components/ui/motion";
import { BrandLogo } from "@/components/ui/BrandLogo";
import { LogoutButton } from "@/components/auth/LogoutButton";
import { WorkspaceSwitcher } from "@/components/workspace/WorkspaceSwitcher";
import type { Workspace } from "@/lib/workspace-nav";
import { cn } from "@/lib/cn";

/**
 * The affiliate console's frame, built the way the admin and agent consoles
 * are: a sidebar that collapses and remembers, a bar across the top, and the
 * page in what is left.
 *
 * It takes the agent shell's phone treatment rather than the admin's, because
 * that is where this work happens — an affiliate is standing in a queue with
 * their thumb on WhatsApp, not at a desk. The four screens they live in sit in
 * a bottom bar under the thumb and the rest is behind More. Nothing is
 * reachable only one way.
 *
 * The workspace switcher at the top is the same idea as the admin console's
 * Retail / Data bundles pair: somebody who is an affiliate *and* a bundle
 * agent *and* a seller moves between the three from here rather than by
 * knowing the URLs.
 */

interface NavItem {
  href: string;
  label: string;
  icon: React.ElementType;
  exact?: boolean;
  /** Shown in the phone's bottom bar. Four at most, plus More. */
  primary?: boolean;
  /** Which count to show against it, when there is one. */
  badge?: keyof AssistCounts;
}

/**
 * What the sidebar needs to nag about.
 *
 * A console that does not say "two people are waiting on you" until you happen
 * to open the right screen is a console where people wait.
 */
export interface AssistCounts {
  unread: number;
  followUps: number;
  escalations: number;
}

const ITEMS: NavItem[] = [
  { href: "/affiliate", label: "Dashboard", icon: LayoutDashboard, exact: true, primary: true },
  { href: "/affiliate/shop", label: "Browse products", icon: ShoppingBag, primary: true },
  { href: "/affiliate/messages", label: "Messages", icon: MessagesSquare, primary: true, badge: "unread" },
  { href: "/affiliate/earnings", label: "Earnings", icon: Wallet, primary: true },
  { href: "/affiliate/team", label: "My team", icon: Network },
  { href: "/affiliate/chatroom", label: "Chatroom", icon: MessageCircle },
  { href: "/affiliate/follow-ups", label: "Follow-ups", icon: ClipboardCheck, badge: "followUps" },
  { href: "/affiliate/customers", label: "My customers", icon: Users },
  { href: "/affiliate/orders", label: "Referred orders", icon: ListOrdered },
  { href: "/affiliate/products", label: "My products", icon: Tags },
  { href: "/affiliate/catalogue", label: "Catalogue", icon: Gift },
  { href: "/affiliate/links", label: "Links & clicks", icon: MousePointerClick },
  { href: "/affiliate/commissions", label: "Commissions", icon: Receipt },
  { href: "/affiliate/escalations", label: "Nickimart enquiries", icon: Headset, badge: "escalations" },
  { href: "/affiliate/performance", label: "Performance", icon: BarChart3 },
  { href: "/affiliate/settings", label: "Settings", icon: Settings },
  { href: "/affiliate/support", label: "Help", icon: LifeBuoy },
];

const NO_COUNTS: AssistCounts = { unread: 0, followUps: 0, escalations: 0 };

/** A count beside a nav entry. Nothing is drawn for nothing. */
function Badge({ n, tone = "orange" }: { n: number; tone?: "orange" | "quiet" }) {
  if (n <= 0) return null;
  return (
    <span
      className={cn(
        "ml-auto min-w-5 rounded-full px-1.5 py-0.5 text-center text-[10px] font-bold leading-4",
        tone === "orange" ? "bg-niki-orange text-white" : "bg-white/15 text-white",
      )}
    >
      {n > 99 ? "99+" : n}
    </span>
  );
}

function isActive(pathname: string, item: NavItem): boolean {
  if (item.exact) return pathname === item.href;
  if (pathname === item.href) return true;
  if (!pathname.startsWith(`${item.href}/`)) return false;
  // A deeper entry of its own wins, so "/affiliate/products" does not light up
  // on a path that belongs to another section nested under it.
  return !ITEMS.some(
    (other) =>
      other.href !== item.href &&
      other.href.startsWith(`${item.href}/`) &&
      (pathname === other.href || pathname.startsWith(`${other.href}/`)),
  );
}

const STORAGE_KEY = "niki-affiliate-sidebar";

/** The same external store the other shells use, with its own key. */
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
      return false;
    }
  },
  set(collapsed: boolean) {
    try {
      window.localStorage.setItem(STORAGE_KEY, collapsed ? "collapsed" : "open");
    } catch {
      // Not worth failing a click over.
    }
    sidebarStore.override = collapsed;
    sidebarStore.listeners.forEach((l) => l());
  },
  override: null as boolean | null,
};

function readCollapsed(): boolean {
  return sidebarStore.override ?? sidebarStore.get();
}

export function AffiliateShell({
  account,
  workspaces,
  counts = NO_COUNTS,
  children,
}: {
  account: { name: string; code: string; status: string };
  workspaces: Workspace[];
  /** Unread messages, outstanding follow-ups and open enquiries. */
  counts?: AssistCounts;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const collapsed = useSyncExternalStore(sidebarStore.subscribe, readCollapsed, () => false);
  const toggle = useCallback(() => sidebarStore.set(!readCollapsed()), []);

  // The drawer is open *for a page*, so navigating closes it without an effect
  // watching the path to do it.
  const [openFor, setOpenFor] = useState<string | null>(null);
  const drawerOpen = openFor === pathname;
  const closeDrawer = useCallback(() => setOpenFor(null), []);

  const primary = ITEMS.filter((i) => i.primary).slice(0, 4);

  return (
    <div className="min-h-screen bg-niki-surface">
      {drawerOpen ? (
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
          drawerOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0",
        )}
      >
        <div className={cn("flex items-center gap-2.5 px-4 py-5", collapsed && "justify-center px-2")}>
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-white/10 text-niki-orange">
            <BrandLogo className="h-5 w-auto" />
          </span>
          {!collapsed ? (
            <div className="min-w-0">
              <p className="truncate font-display text-sm font-bold leading-tight">
                Affiliate Console
              </p>
              <p className="truncate font-mono text-[11px] leading-tight text-white/45">
                {account.code || "—"}
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

        <WorkspaceSwitcher workspaces={workspaces} collapsed={collapsed} active="affiliate" />

        <nav className="scrollbar-none flex-1 overflow-y-auto px-3 pb-4">
          {!collapsed ? (
            <p className="px-3 pb-2 pt-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-white/35">
              Main menu
            </p>
          ) : (
            <div className="my-3 border-t border-white/10" />
          )}
          <ul className="space-y-0.5">
            {ITEMS.map((item) => {
              const active = isActive(pathname, item);
              const Icon = item.icon;
              return (
                <li key={item.href}>
                  <ActionLink
                    href={item.href}
                    aria-current={active ? "page" : undefined}
                    title={collapsed ? item.label : undefined}
                    className={cn(
                      "relative flex items-center gap-2.5 rounded-lg px-3 py-2.5 text-sm font-semibold transition-colors",
                      active
                        ? "bg-niki-orange text-white"
                        : "text-white/60 hover:bg-white/10 hover:text-white",
                      collapsed && "justify-center px-0",
                    )}
                  >
                    <Icon className="h-4 w-4 shrink-0" />
                    {!collapsed ? (
                      <>
                        <span className="truncate">{item.label}</span>
                        {item.badge ? (
                          <Badge n={counts[item.badge]} tone={active ? "quiet" : "orange"} />
                        ) : null}
                      </>
                    ) : item.badge && counts[item.badge] > 0 ? (
                      <span
                        aria-hidden
                        className="absolute right-2 top-2 h-2 w-2 rounded-full bg-niki-orange ring-2 ring-niki-black"
                      />
                    ) : null}
                  </ActionLink>
                </li>
              );
            })}
          </ul>

          <ActionLink
            href="/products"
            title={collapsed ? "Open the storefront" : undefined}
            className={cn(
              "mt-3 flex items-center gap-2.5 rounded-lg border border-white/10 px-3 py-2.5 text-sm font-semibold text-white/60 transition-colors hover:bg-white/10 hover:text-white",
              collapsed && "justify-center px-0",
            )}
          >
            <Store className="h-4 w-4 shrink-0" />
            {!collapsed ? "The storefront" : null}
          </ActionLink>
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
          <div className="flex items-center gap-3 px-4 py-3 sm:px-6">
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
                {account.name}
              </p>
              <p className="truncate text-xs text-niki-ink/50">
                {account.status === "active"
                  ? "Affiliate console"
                  : account.status === "pending"
                    ? "Affiliate console · awaiting approval"
                    : "Affiliate console · on hold"}
              </p>
            </div>

            <div className="ml-auto flex items-center gap-1.5">
              <ActionLink
                href="/account"
                className="niki-press hidden items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-semibold text-niki-ink/70 ring-1 ring-niki-edge hover:bg-niki-black/5 sm:flex"
              >
                <ExternalLink className="h-3.5 w-3.5" />
                My account
              </ActionLink>
            </div>
          </div>
        </header>

        {/* Bottom padding on the phone so the last row clears the tab bar. */}
        <main className="flex-1 px-4 py-5 pb-24 sm:px-6 lg:pb-8">{children}</main>
      </div>

      <nav
        aria-label="Affiliate"
        className="fixed inset-x-0 bottom-0 z-40 border-t border-niki-edge bg-white/95 pb-[env(safe-area-inset-bottom)] backdrop-blur lg:hidden"
      >
        <div className="grid grid-cols-5">
          {primary.map((item) => {
            const active = isActive(pathname, item);
            const Icon = item.icon;
            return (
              <ActionLink
                key={item.href}
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "relative flex flex-col items-center gap-1 px-1 py-2.5 text-[10px] font-semibold transition-colors",
                  active ? "text-niki-orange" : "text-niki-ink/50",
                )}
              >
                <Icon className="h-5 w-5" />
                {item.badge && counts[item.badge] > 0 ? (
                  <span className="absolute right-[18%] top-1.5 min-w-4 rounded-full bg-niki-orange px-1 text-center text-[9px] font-bold leading-4 text-white">
                    {counts[item.badge] > 9 ? "9+" : counts[item.badge]}
                  </span>
                ) : null}
                {item.label.split(" ")[0]}
              </ActionLink>
            );
          })}
          <button
            type="button"
            onClick={() => setOpenFor(pathname)}
            className="relative flex flex-col items-center gap-1 px-1 py-2.5 text-[10px] font-semibold text-niki-ink/50"
          >
            <MoreHorizontal className="h-5 w-5" />
            {/* Whatever is behind More still has to be able to ask for you. */}
            {counts.followUps + counts.escalations > 0 ? (
              <span
                aria-hidden
                className="absolute right-[26%] top-2 h-2 w-2 rounded-full bg-niki-orange"
              />
            ) : null}
            More
          </button>
        </div>
      </nav>
    </div>
  );
}
