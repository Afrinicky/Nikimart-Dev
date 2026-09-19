"use client";

import { useCallback, useState, useSyncExternalStore } from "react";
import { usePathname } from "next/navigation";
import {
  BadgeCheck,
  Bell,
  ChevronLeft,
  ExternalLink,
  LayoutDashboard,
  LifeBuoy,
  ListOrdered,
  Menu,
  MoreHorizontal,
  Settings,
  Store,
  Trophy,
  Users,
  Wallet,
  X,
} from "lucide-react";
import { ActionLink } from "@/components/ui/motion";
import { AgentAccountMenu } from "@/components/agent/AgentAccountMenu";
import { LogoutButton } from "@/components/auth/LogoutButton";
import {
  AnnouncementPopup,
  useUnreadAnnouncements,
  type PopupAnnouncement,
} from "@/components/agent/AnnouncementPopup";
import { cn } from "@/lib/cn";

/**
 * The agent platform's frame, built the same way the admin console is: a
 * sidebar that collapses, a bar across the top, and the page in what is left.
 *
 * Where it differs is the phone, because that is where agents actually work.
 * A drawer alone would mean two taps to reach Orders while a customer waits, so
 * the five screens an agent lives in sit in a bottom bar under the thumb, and
 * the drawer holds the rest. Nothing is reachable only one way.
 */

interface NavItem {
  href: string;
  label: string;
  icon: React.ElementType;
  exact?: boolean;
  /** Shown in the phone's bottom bar. Five at most — six stops being tappable. */
  primary?: boolean;
}

const ITEMS: NavItem[] = [
  { href: "/agent", label: "Dashboard", icon: LayoutDashboard, exact: true, primary: true },
  { href: "/agent/orders", label: "Orders", icon: ListOrdered, primary: true },
  { href: "/agent/team", label: "My team", icon: Users, primary: true },
  { href: "/agent/wallet", label: "Wallet", icon: Wallet, primary: true },
  { href: "/agent/store", label: "Store", icon: Store },
  { href: "/agent/leaderboard", label: "Leaderboard", icon: Trophy },
  { href: "/agent/afa", label: "AFA", icon: BadgeCheck },
  { href: "/agent/notifications", label: "Notifications", icon: Bell },
  { href: "/agent/settings", label: "Settings", icon: Settings },
  { href: "/agent/support", label: "Support", icon: LifeBuoy },
];

function isActive(pathname: string, item: NavItem): boolean {
  return item.exact
    ? pathname === item.href
    : pathname === item.href || pathname.startsWith(`${item.href}/`);
}

const STORAGE_KEY = "niki-agent-sidebar";

/** The same external store the admin shell uses, with its own key. */
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

export function AgentShell({
  store,
  announcements = [],
  children,
}: {
  store: { name: string; slug: string; code: string; afaEnabled: boolean; leaderboardEnabled: boolean };
  /** Live announcements; unseen ones pop up, and the rest feed the bell. */
  announcements?: PopupAnnouncement[];
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  // One source of truth for "seen": the badge and the pop-up cannot disagree.
  const unread = useUnreadAnnouncements(announcements.map((a) => a.id));
  const collapsed = useSyncExternalStore(sidebarStore.subscribe, readCollapsed, () => false);
  const toggle = useCallback(() => sidebarStore.set(!readCollapsed()), []);

  const [openFor, setOpenFor] = useState<string | null>(null);
  const drawerOpen = openFor === pathname;
  const closeDrawer = useCallback(() => setOpenFor(null), []);

  // A screen the admin has switched off is a dead end, not a menu item.
  const items = ITEMS.filter(
    (i) =>
      (store.afaEnabled || i.href !== "/agent/afa") &&
      (store.leaderboardEnabled || i.href !== "/agent/leaderboard"),
  );
  const primary = items.filter((i) => i.primary).slice(0, 4);

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
        <div className={cn("flex items-center gap-2.5 px-3 py-5", collapsed && "justify-center px-2")}>
          <AgentAccountMenu name={store.name} code={store.code} collapsed={collapsed} />
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

        <nav className="scrollbar-none flex-1 overflow-y-auto px-3 pb-4">
          {!collapsed ? (
            <p className="px-3 pb-2 pt-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-white/35">
              Menu
            </p>
          ) : null}
          <ul className="space-y-0.5">
            {items.map((item) => {
              const active = isActive(pathname, item);
              const Icon = item.icon;
              return (
                <li key={item.href}>
                  <ActionLink
                    href={item.href}
                    data-tour={`nav-${item.href.split("/").pop()}`}
                    aria-current={active ? "page" : undefined}
                    title={collapsed ? item.label : undefined}
                    className={cn(
                      "flex items-center gap-2.5 rounded-lg px-3 py-2.5 text-sm font-semibold transition-colors",
                      active
                        ? "bg-niki-orange text-white"
                        : "text-white/60 hover:bg-white/10 hover:text-white",
                      collapsed && "justify-center px-0",
                    )}
                  >
                    <Icon className="h-4 w-4 shrink-0" />
                    {!collapsed ? <span className="truncate">{item.label}</span> : null}
                    {item.href === "/agent/notifications" && unread > 0 && !collapsed ? (
                      <span className="ml-auto rounded-md bg-niki-orange px-1.5 py-0.5 text-[10px] font-bold text-white">
                        {unread}
                      </span>
                    ) : null}
                  </ActionLink>
                </li>
              );
            })}
          </ul>

          <ActionLink
            href={`/store/${store.slug}`}
            title={collapsed ? "View my store" : undefined}
            className={cn(
              "mt-3 flex items-center gap-2.5 rounded-lg border border-white/10 px-3 py-2.5 text-sm font-semibold text-white/60 transition-colors hover:bg-white/10 hover:text-white",
              collapsed && "justify-center px-0",
            )}
          >
            <ExternalLink className="h-4 w-4 shrink-0" />
            {!collapsed ? "View my store" : null}
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
                {store.name}
              </p>
              <p className="truncate font-mono text-[11px] text-niki-ink/45">{store.code}</p>
            </div>

            <div className="ml-auto flex items-center gap-1.5">
              <ActionLink
                href={`/store/${store.slug}`}
                className="niki-press hidden items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-semibold text-niki-ink/70 ring-1 ring-niki-edge hover:bg-niki-black/5 sm:flex"
              >
                <ExternalLink className="h-3.5 w-3.5" />
                My store
              </ActionLink>
              <ActionLink
                href="/agent/notifications"
                aria-label="Notifications"
                className="niki-press relative rounded-lg p-2 text-niki-ink/60 ring-1 ring-niki-edge hover:bg-niki-black/5"
              >
                <Bell className="h-4.5 w-4.5" />
                {unread > 0 ? (
                  <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-md bg-niki-orange px-1 text-[10px] font-bold text-white">
                    {unread > 9 ? "9+" : unread}
                  </span>
                ) : null}
              </ActionLink>
            </div>
          </div>
        </header>

        {/* Bottom padding on the phone so the last row clears the tab bar. */}
        <main className="flex-1 px-4 py-5 pb-24 sm:px-6 lg:pb-8">{children}</main>
      </div>

      <AnnouncementPopup announcements={announcements} />

      {/* The phone's tab bar: the four screens an agent works in, under the
          thumb, plus everything else behind More. */}
      <nav
        aria-label="Agent"
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
                data-tour={`nav-${item.href.split("/").pop()}`}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex flex-col items-center gap-1 px-1 py-2.5 text-[10px] font-semibold transition-colors",
                  active ? "text-niki-orange" : "text-niki-ink/50",
                )}
              >
                <Icon className="h-5 w-5" />
                {item.label}
              </ActionLink>
            );
          })}
          <button
            type="button"
            onClick={() => setOpenFor(pathname)}
            className="flex flex-col items-center gap-1 px-1 py-2.5 text-[10px] font-semibold text-niki-ink/50"
          >
            <MoreHorizontal className="h-5 w-5" />
            More
          </button>
        </div>
      </nav>
    </div>
  );
}
