"use client";

import { useCallback, useState, useSyncExternalStore } from "react";
import { usePathname } from "next/navigation";
import {
  Banknote,
  Boxes,
  Building2,
  ChevronLeft,
  ClipboardList,
  FileSignature,
  FileText,
  Gavel,
  LayoutDashboard,
  Menu,
  Package,
  PackageCheck,
  Receipt,
  ScrollText,
  Settings,
  ShieldCheck,
  ShoppingCart,
  Truck,
  Users,
  X,
} from "lucide-react";
import { MedicalLink } from "@/components/medical/ui/MedicalLink";
import { MedicalLogo } from "@/components/medical/ui/MedicalLogo";
import { canSeeSection, MEDICAL_ROLE_LABELS, type MedicalRole } from "@/lib/medical/roles";
import { cn } from "@/lib/cn";

/**
 * The medical console's frame.
 *
 * Structurally the retail `AdminShell`: a sidebar down the left, a bar across
 * the top, the page in what is left, and the collapsed state remembered per
 * browser through `useSyncExternalStore` so the server render never flips to
 * a different one in an effect. The reasoning there applies here unchanged,
 * and is worth not re-deriving — a console whose navigation scrolls sideways
 * on a laptop is one where people cannot see where they are.
 *
 * What differs: the palette, and that the sections are filtered by role before
 * they are drawn. `canSeeSection` is the same function the page guard uses, so
 * the menu cannot offer something the page will refuse — which is the failure
 * that makes people stop trusting a console's navigation.
 */

interface NavItem {
  /** The section key in SECTION_ACCESS, and the path under /medicals/admin. */
  section: string;
  label: string;
  icon: React.ElementType;
}

interface NavGroup {
  heading: string;
  items: NavItem[];
}

/**
 * Grouped by what somebody is doing, not by which table it reads.
 *
 * Selling, buying and holding are three different jobs done by three different
 * people here, and a flat list of fourteen entries makes each of them scan
 * past the other two every time.
 */
const GROUPS: NavGroup[] = [
  {
    heading: "Selling",
    items: [
      { section: "tenders", label: "Tenders", icon: Gavel },
      { section: "institutions", label: "Institutions", icon: Building2 },
      { section: "quotations", label: "Quotations", icon: FileText },
      { section: "customer-purchase-orders", label: "Customer POs", icon: FileSignature },
      { section: "customer-orders", label: "Sales orders", icon: ShoppingCart },
    ],
  },
  {
    heading: "Buying",
    items: [
      { section: "sourcing", label: "Sourcing", icon: ClipboardList },
      { section: "suppliers", label: "Suppliers", icon: Users },
      { section: "supplier-quotes", label: "Supplier quotes", icon: Receipt },
      { section: "purchase-orders", label: "Purchase orders", icon: Truck },
      { section: "goods-received", label: "Goods received", icon: PackageCheck },
      { section: "payables", label: "Payables", icon: Banknote },
    ],
  },
  {
    heading: "Holding",
    items: [
      { section: "inventory", label: "Inventory", icon: Boxes },
      { section: "products", label: "Products", icon: Package },
    ],
  },
  {
    heading: "Administration",
    items: [
      { section: "staff", label: "Staff", icon: ShieldCheck },
      { section: "audit", label: "Audit log", icon: ScrollText },
      { section: "settings", label: "Settings", icon: Settings },
    ],
  },
];

const OVERVIEW: NavItem = { section: "", label: "Overview", icon: LayoutDashboard };

const STORAGE_KEY = "medi-admin-sidebar";

/**
 * Whether the sidebar is collapsed, kept outside React.
 *
 * It has to be read from localStorage, which the server cannot see, and a
 * server-rendered "open" that flips to "collapsed" in an effect is a layout
 * that jumps on every page load. Same shape as the retail shell and the
 * medical basket, for the same reason.
 */
const sidebarStore = {
  listeners: new Set<() => void>(),
  subscribe(listener: () => void) {
    sidebarStore.listeners.add(listener);
    return () => {
      sidebarStore.listeners.delete(listener);
    };
  },
  getSnapshot(): boolean {
    try {
      return window.localStorage.getItem(STORAGE_KEY) === "collapsed";
    } catch {
      return false;
    }
  },
  getServerSnapshot(): boolean {
    return false;
  },
  toggle() {
    try {
      const next = sidebarStore.getSnapshot() ? "open" : "collapsed";
      window.localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // Storage blocked. The toggle still repaints for this page view.
    }
    for (const listener of sidebarStore.listeners) listener();
  },
};

function pathFor(section: string): string {
  return section ? `/medicals/admin/${section}` : "/medicals/admin";
}

/**
 * Whether a nav entry owns the current path.
 *
 * The deepest match wins, so "/medicals/admin/purchase-orders" does not light
 * up "Overview", and a section with a child route keeps its own highlight.
 */
function isActive(pathname: string, section: string): boolean {
  const href = pathFor(section);
  if (!section) return pathname === href;
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function MedicalAdminShell({
  role,
  name,
  children,
}: {
  role: MedicalRole;
  name: string;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const collapsed = useSyncExternalStore(
    sidebarStore.subscribe,
    sidebarStore.getSnapshot,
    sidebarStore.getServerSnapshot,
  );

  /**
   * The drawer's open state, keyed to the path it was opened on — the same
   * trick the storefront header uses. A navigation changes `pathname`, the
   * comparison stops matching, and the drawer closes in the same render that
   * paints the new page rather than one frame later in an effect.
   */
  const [drawerOn, setDrawerOn] = useState<string | null>(null);
  const drawerOpen = drawerOn === pathname;
  const closeDrawer = useCallback(() => setDrawerOn(null), []);

  const groups = GROUPS.map((group) => ({
    ...group,
    items: group.items.filter((item) => canSeeSection(role, item.section)),
  })).filter((group) => group.items.length > 0);

  return (
    <div className="medi flex min-h-screen bg-medi-surface">
      <Sidebar
        groups={groups}
        pathname={pathname}
        collapsed={collapsed}
        onToggle={sidebarStore.toggle}
      />

      {drawerOpen ? (
        <>
          <button
            type="button"
            aria-label="Close menu"
            onClick={closeDrawer}
            className="medi-z-drawer-backdrop animate-fade-in fixed inset-0 bg-medi-ink/45 lg:hidden"
          />
          <div className="medi-z-drawer animate-sheet-up fixed inset-y-0 left-0 w-[min(17rem,85vw)] lg:hidden">
            <Sidebar
              groups={groups}
              pathname={pathname}
              collapsed={false}
              onNavigate={closeDrawer}
              onClose={closeDrawer}
            />
          </div>
        </>
      ) : null}

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="medi-z-sticky sticky top-0 flex h-14 items-center gap-3 border-b border-medi-rule bg-white px-4 sm:px-6">
          <button
            type="button"
            onClick={() => setDrawerOn(pathname)}
            aria-label="Open menu"
            className="medi-focus medi-press -ml-1 flex h-10 w-10 items-center justify-center rounded-xl text-medi-ink hover:bg-medi-mint-50 lg:hidden"
          >
            <Menu className="h-5 w-5" aria-hidden />
          </button>

          <MedicalLink
            href="/medicals"
            className="medi-focus hidden rounded-lg px-2 py-1 text-[0.8125rem] font-medium text-medi-body hover:text-medi-teal-700 sm:block"
          >
            View the storefront
          </MedicalLink>

          <div className="ml-auto flex items-center gap-3">
            <span className="hidden text-right sm:block">
              <span className="block text-[0.8125rem] font-semibold leading-tight text-medi-ink">
                {name}
              </span>
              <span className="medi-meta block leading-tight text-medi-muted">
                {MEDICAL_ROLE_LABELS[role]}
              </span>
            </span>
            <span
              aria-hidden
              className="flex h-9 w-9 items-center justify-center rounded-full bg-medi-mint-100 text-[0.8125rem] font-bold text-medi-teal-800"
            >
              {initialsOf(name)}
            </span>
          </div>
        </header>

        <main className="min-w-0 flex-1 px-4 py-6 sm:px-6 lg:px-8">{children}</main>
      </div>
    </div>
  );
}

function Sidebar({
  groups,
  pathname,
  collapsed,
  onToggle,
  onNavigate,
  onClose,
}: {
  groups: NavGroup[];
  pathname: string;
  collapsed: boolean;
  onToggle?: () => void;
  onNavigate?: () => void;
  onClose?: () => void;
}) {
  return (
    <nav
      aria-label="Console"
      className={cn(
        "flex h-screen shrink-0 flex-col overflow-y-auto bg-medi-ink text-white/70",
        onClose ? "w-full" : "sticky top-0 hidden lg:flex",
        collapsed ? "lg:w-[4.5rem]" : "lg:w-[15rem]",
      )}
    >
      <div
        className={cn(
          "flex h-14 shrink-0 items-center border-b border-medi-rule-light",
          collapsed ? "justify-center px-2" : "justify-between px-4",
        )}
      >
        {collapsed ? null : <MedicalLogo tone="light" />}
        {onClose ? (
          <button
            type="button"
            onClick={onClose}
            aria-label="Close menu"
            className="medi-focus flex h-9 w-9 items-center justify-center rounded-lg text-white/70 hover:bg-white/10"
          >
            <X className="h-4.5 w-4.5" aria-hidden />
          </button>
        ) : onToggle ? (
          <button
            type="button"
            onClick={onToggle}
            aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            className="medi-focus flex h-8 w-8 items-center justify-center rounded-lg text-white/55 transition-colors hover:bg-white/10 hover:text-white"
          >
            <ChevronLeft
              className={cn("h-4 w-4 transition-transform", collapsed && "rotate-180")}
              aria-hidden
            />
          </button>
        ) : null}
      </div>

      <div className="flex-1 px-2 py-3">
        <SidebarItem
          item={OVERVIEW}
          pathname={pathname}
          collapsed={collapsed}
          onNavigate={onNavigate}
        />

        {groups.map((group) => (
          <div key={group.heading} className="mt-5">
            {collapsed ? (
              <span
                aria-hidden
                className="mx-auto mb-2 block h-px w-6 bg-medi-rule-light"
              />
            ) : (
              <p className="medi-meta px-3 pb-1.5 font-semibold uppercase tracking-wider text-white/35">
                {group.heading}
              </p>
            )}
            <ul className="space-y-0.5">
              {group.items.map((item) => (
                <li key={item.section}>
                  <SidebarItem
                    item={item}
                    pathname={pathname}
                    collapsed={collapsed}
                    onNavigate={onNavigate}
                  />
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </nav>
  );
}

function SidebarItem({
  item,
  pathname,
  collapsed,
  onNavigate,
}: {
  item: NavItem;
  pathname: string;
  collapsed: boolean;
  onNavigate?: () => void;
}) {
  const active = isActive(pathname, item.section);
  const Icon = item.icon;

  return (
    <MedicalLink
      href={pathFor(item.section)}
      onClick={onNavigate}
      aria-current={active ? "page" : undefined}
      // The label is the accessible name when collapsed; a bare icon with a
      // tooltip is a control a screen reader announces as nothing.
      title={collapsed ? item.label : undefined}
      aria-label={collapsed ? item.label : undefined}
      className={cn(
        "medi-focus flex items-center gap-3 rounded-lg px-3 py-2 text-[0.8125rem] font-medium transition-colors",
        collapsed && "justify-center px-0",
        active ? "bg-medi-teal-700 text-white" : "text-white/65 hover:bg-white/10 hover:text-white",
      )}
    >
      <Icon className="h-[1.0625rem] w-[1.0625rem] shrink-0" aria-hidden />
      {collapsed ? null : <span className="truncate">{item.label}</span>}
    </MedicalLink>
  );
}

function initialsOf(name: string): string {
  return (
    name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((word) => word[0]?.toUpperCase())
      .join("") || "?"
  );
}
