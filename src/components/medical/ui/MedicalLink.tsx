"use client";

import type { ComponentProps, ReactNode } from "react";
import Link from "next/link";
import { LinkSpinner } from "@/components/ui/motion";
import { cn } from "@/lib/cn";

/**
 * A link that presses under the finger and shows a spinner while the next
 * route loads — the medical twin of the mall's `ActionLink`.
 *
 * A twin rather than a reuse, for one reason: `ActionLink` hard-codes
 * `niki-press niki-focus`, and `niki-focus` draws an orange ring. `cn` here is
 * plain clsx with no tailwind-merge, so passing `medi-focus` alongside it
 * leaves both class names on the element and the ring that wins is whichever
 * rule happens to be later in the stylesheet. A focus ring decided by CSS
 * source order is a focus ring that will eventually turn orange on a teal page
 * without anybody touching this file.
 *
 * The spinner itself is shared: `LinkSpinner` reads `useLinkStatus` from the
 * Link it sits inside, and that logic should exist once.
 */
export function MedicalLink({
  children,
  className,
  spinnerClassName,
  ...props
}: ComponentProps<typeof Link> & { spinnerClassName?: string; children: ReactNode }) {
  return (
    <Link {...props} className={cn("medi-press medi-focus", className)}>
      {children}
      <LinkSpinner className={spinnerClassName} />
    </Link>
  );
}
