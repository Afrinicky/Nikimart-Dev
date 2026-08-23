import Link from "next/link";
import { cn } from "@/lib/cn";

/** A pill filter for admin list pages. Links, so filters survive a refresh. */
export function FilterChip({
  href,
  label,
  active,
}: {
  href: string;
  label: string;
  active: boolean;
}) {
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={cn(
        "rounded-full px-3.5 py-1.5 text-xs font-semibold transition-colors",
        active
          ? "bg-niki-navy text-white"
          : "bg-white text-niki-ink/70 ring-1 ring-niki-edge hover:bg-niki-navy/5",
      )}
    >
      {label}
    </Link>
  );
}
