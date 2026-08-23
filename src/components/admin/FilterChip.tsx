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
          ? "niki-chip-active bg-niki-navy text-white"
          : "niki-chip text-niki-ink/75 hover:text-niki-ink",
      )}
    >
      {label}
    </Link>
  );
}
