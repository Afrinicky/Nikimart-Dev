"use client";

import Link from "next/link";
import { Store, User } from "lucide-react";
import { useAccount } from "./useAccount";

/**
 * The header's account link and the dashboard chip beside it.
 *
 * A client island purely so the rest of the header — and with it every page on
 * the site — can be rendered once and cached. See useAccount.
 */
export function AccountLink({ className }: { className: string }) {
  const { href, label } = useAccount();
  return (
    <Link href={href} className={className} aria-label={label}>
      <User className="h-5 w-5" />
      <span className="hidden whitespace-nowrap text-[10px] font-medium sm:block">{label}</span>
    </Link>
  );
}

/**
 * "Seller", "Admin" and so on for staff; "Sell on Nickimart" for everyone else.
 *
 * Shoppers are the overwhelming majority and the sell button is what the header
 * is for, so that is what renders while the session resolves — a staff member
 * sees their chip a moment later, rather than everyone seeing a gap.
 */
export function RoleOrSellButton() {
  const { roleLabel, href } = useAccount();

  if (roleLabel) {
    return (
      <Link
        href={href}
        className="ml-1 hidden shrink-0 items-center gap-1.5 rounded-full bg-niki-ink/5 px-4 py-2 text-sm font-semibold text-niki-ink ring-1 ring-niki-edge transition-colors hover:bg-niki-ink/10 lg:flex"
      >
        {roleLabel}
      </Link>
    );
  }
  return (
    <Link
      href="/sell"
      className="niki-press ml-1 hidden shrink-0 items-center gap-1.5 rounded-full bg-niki-orange px-4 py-2 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-niki-orange-light sm:flex"
    >
      <Store className="h-4 w-4" />
      Sell on Nickimart
    </Link>
  );
}
