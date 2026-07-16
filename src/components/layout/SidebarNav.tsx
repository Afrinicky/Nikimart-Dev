"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  BadgeCheck,
  ClipboardList,
  Globe2,
  GraduationCap,
  HelpCircle,
  LayoutGrid,
  LayoutDashboard,
  LogIn,
  MapPin,
  Menu,
  Package2,
  ShieldCheck,
  ShoppingCart,
  Store,
  Utensils,
  Wrench,
  X,
} from "lucide-react";

type Item = { href: string; label: string; icon: React.ComponentType<{ className?: string }> };

const SECTIONS: { title: string; items: Item[] }[] = [
  {
    title: "Shop",
    items: [
      { href: "/products", label: "All Products", icon: LayoutGrid },
      { href: "/categories/nikimart-official-store", label: "Official Store", icon: BadgeCheck },
      { href: "/preorders", label: "Preorder Deals", icon: Package2 },
      { href: "/services", label: "Services", icon: Wrench },
      { href: "/products?category=food-drinks", label: "Food & Drinks", icon: Utensils },
      { href: "/global-shopping", label: "Global Shopping", icon: Globe2 },
      { href: "/campus", label: "Shop by Campus", icon: GraduationCap },
      { href: "/shops", label: "Shops & Vendors", icon: Store },
    ],
  },
  {
    title: "Support",
    items: [
      { href: "/help", label: "Help Centre", icon: HelpCircle },
      { href: "/pickup-points", label: "Pickup Points", icon: MapPin },
      { href: "/buyer-protection", label: "Buyer Protection", icon: ShieldCheck },
    ],
  },
];

export function SidebarNav({
  accountHref,
  accountLabel,
  isAuthed,
}: {
  accountHref: string;
  accountLabel: string;
  isAuthed: boolean;
}) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();

  // Close on route change.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setOpen(false);
  }, [pathname]);

  // Lock scroll + close on Escape while open.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [open]);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Open menu"
        className="flex items-center justify-center rounded-xl p-2 text-white/90 transition-colors hover:bg-white/10 lg:hidden"
      >
        <Menu className="h-6 w-6" />
      </button>

      {/* Backdrop */}
      <div
        onClick={() => setOpen(false)}
        className={`fixed inset-0 z-[60] bg-black/50 transition-opacity lg:hidden ${
          open ? "opacity-100" : "pointer-events-none opacity-0"
        }`}
        aria-hidden
      />

      {/* Drawer */}
      <aside
        className={`fixed inset-y-0 left-0 z-[70] flex w-80 max-w-[85%] flex-col bg-white shadow-2xl transition-transform lg:hidden ${
          open ? "translate-x-0" : "-translate-x-full"
        }`}
        aria-hidden={!open}
      >
        <div className="flex items-center justify-between bg-niki-navy px-5 py-4">
          <Link href="/" className="flex items-center gap-2" onClick={() => setOpen(false)}>
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-niki-orange to-niki-gold font-display text-lg font-bold text-niki-navy">
              N
            </span>
            <span className="font-display text-lg font-bold text-white">
              Niki<span className="text-niki-orange">Mart</span>
            </span>
          </Link>
          <button
            type="button"
            onClick={() => setOpen(false)}
            aria-label="Close menu"
            className="rounded-lg p-1.5 text-white/80 transition-colors hover:bg-white/10"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <nav className="flex-1 overflow-y-auto px-3 py-4">
          <Link
            href={accountHref}
            className="mb-3 flex items-center gap-3 rounded-xl bg-niki-surface px-4 py-3 text-sm font-semibold text-niki-ink"
          >
            {isAuthed ? <LayoutDashboard className="h-5 w-5 text-niki-orange" /> : <LogIn className="h-5 w-5 text-niki-orange" />}
            {isAuthed ? accountLabel : "Sign in / Register"}
          </Link>

          <div className="mb-3 grid grid-cols-2 gap-2">
            <Link href="/orders" className="flex items-center gap-2 rounded-xl bg-niki-surface px-3 py-2.5 text-sm font-medium text-niki-ink/80">
              <ClipboardList className="h-4 w-4 text-niki-orange" /> Orders
            </Link>
            <Link href="/cart" className="flex items-center gap-2 rounded-xl bg-niki-surface px-3 py-2.5 text-sm font-medium text-niki-ink/80">
              <ShoppingCart className="h-4 w-4 text-niki-orange" /> Cart
            </Link>
          </div>

          {SECTIONS.map((section) => (
            <div key={section.title} className="mb-4">
              <p className="px-4 pb-1 text-xs font-semibold uppercase tracking-wide text-niki-ink/40">
                {section.title}
              </p>
              <ul>
                {section.items.map((item) => (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      className="flex items-center gap-3 rounded-xl px-4 py-2.5 text-sm text-niki-ink/80 transition-colors hover:bg-niki-navy/5"
                    >
                      <item.icon className="h-5 w-5 text-niki-ink/40" />
                      {item.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}

          <Link
            href="/sell"
            className="mt-2 flex items-center justify-center gap-2 rounded-full bg-niki-orange px-4 py-3 text-sm font-semibold text-white"
          >
            <Store className="h-4 w-4" />
            Sell on NikiMart
          </Link>
        </nav>
      </aside>
    </>
  );
}
