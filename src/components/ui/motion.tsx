"use client";

import { useEffect, useRef, useState, type ComponentProps, type ReactNode } from "react";
import Link, { useLinkStatus } from "next/link";
import { usePathname } from "next/navigation";
import { useFormStatus } from "react-dom";
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/cn";

/**
 * Feedback primitives.
 *
 * The complaint these answer: you tap something, and until the next screen
 * paints nothing on the page acknowledges the tap. Server-rendered navigation
 * makes that gap real — the click starts a fetch, and React has nothing to show
 * until it lands.
 *
 * `useLinkStatus` tells us a Link is mid-navigation, `useFormStatus` tells us a
 * server action is in flight; both drive a spinner in place. Everything else
 * here is the press/hover feel that makes the tap itself feel registered.
 */

// ---------------------------------------------------------------------------
// Links
// ---------------------------------------------------------------------------

/**
 * The spinner shown inside a pending Link. Must be rendered *inside* <Link>:
 * useLinkStatus only reports on the link it is nested in.
 *
 * It waits 120ms before appearing, so an instant (prefetched) navigation never
 * flashes a spinner at you.
 */
export function LinkSpinner({ className }: { className?: string }) {
  const { pending } = useLinkStatus();
  const [show, setShow] = useState(false);

  useEffect(() => {
    if (!pending) {
      setShow(false);
      return;
    }
    const t = setTimeout(() => setShow(true), 120);
    return () => clearTimeout(t);
  }, [pending]);

  if (!show) return null;
  return <Loader2 className={cn("h-4 w-4 shrink-0 animate-spin", className)} aria-hidden />;
}

/** Dims a pending Link's own content so the spinner reads as "this one". */
function PendingDim({ children }: { children: ReactNode }) {
  const { pending } = useLinkStatus();
  return (
    <span className={cn("contents", pending && "opacity-70")} aria-busy={pending || undefined}>
      {children}
    </span>
  );
}

/**
 * A Link that presses under the finger and shows a spinner while the next
 * route loads. Drop-in for `next/link` anywhere a click leaves the page.
 */
export function ActionLink({
  children,
  className,
  spinnerClassName,
  ...props
}: ComponentProps<typeof Link> & { spinnerClassName?: string }) {
  return (
    <Link {...props} className={cn("niki-press niki-focus", className)}>
      <PendingDim>{children}</PendingDim>
      <LinkSpinner className={spinnerClassName} />
    </Link>
  );
}

// ---------------------------------------------------------------------------
// Buttons
// ---------------------------------------------------------------------------

/**
 * A submit button that shows its own spinner while the surrounding form's
 * server action runs. Use inside a <form action={…}>.
 */
export function SubmitButton({
  children,
  className,
  pendingLabel,
  icon,
  ...props
}: ComponentProps<"button"> & { pendingLabel?: string; icon?: ReactNode }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      {...props}
      disabled={pending || props.disabled}
      aria-busy={pending || undefined}
      className={cn(
        "niki-press niki-focus inline-flex items-center justify-center gap-2 disabled:cursor-not-allowed disabled:opacity-60",
        className,
      )}
    >
      {pending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : icon}
      {pending && pendingLabel ? pendingLabel : children}
    </button>
  );
}

/**
 * A button whose pending state you drive yourself (a client-side action, an
 * optimistic toggle). Same look as SubmitButton.
 */
export function BusyButton({
  children,
  className,
  busy = false,
  pendingLabel,
  icon,
  ...props
}: ComponentProps<"button"> & { busy?: boolean; pendingLabel?: string; icon?: ReactNode }) {
  return (
    <button
      {...props}
      disabled={busy || props.disabled}
      aria-busy={busy || undefined}
      className={cn(
        "niki-press niki-focus inline-flex items-center justify-center gap-2 disabled:cursor-not-allowed disabled:opacity-60",
        className,
      )}
    >
      {busy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : icon}
      {busy && pendingLabel ? pendingLabel : children}
    </button>
  );
}

// ---------------------------------------------------------------------------
// Page-level progress
// ---------------------------------------------------------------------------

/**
 * A thin bar across the top of the viewport. Deliberately dumb: it shows while
 * `active` is true and the caller decides when that is.
 */
export function ProgressBar({ active }: { active: boolean }) {
  if (!active) return null;
  return (
    <div
      className="pointer-events-none fixed inset-x-0 top-0 z-[100] h-0.5 overflow-hidden bg-niki-orange/15"
      role="progressbar"
      aria-label="Loading"
    >
      <div className="animate-progress-bar h-full w-full bg-niki-orange" />
    </div>
  );
}

/**
 * The navigation progress bar for a whole layout. Because `useLinkStatus` only
 * works inside a Link, this listens for clicks on any in-app anchor and clears
 * itself when the pathname changes — which is exactly when the new route has
 * painted.
 */
export function RouteProgress() {
  const pathname = usePathname();
  const [active, setActive] = useState(false);
  const settled = useRef(pathname);

  useEffect(() => {
    if (settled.current !== pathname) {
      settled.current = pathname;
      setActive(false);
    }
  }, [pathname]);

  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const anchor = (e.target as HTMLElement | null)?.closest?.("a");
      if (!(anchor instanceof HTMLAnchorElement)) return;
      if (anchor.target && anchor.target !== "_self") return;
      if (anchor.hasAttribute("download")) return;

      const href = anchor.getAttribute("href") ?? "";
      // Same-page anchors and external links never trigger a route change.
      if (!href.startsWith("/") || href.startsWith("//")) return;
      if (href === pathname) return;

      setActive(true);
    }
    document.addEventListener("click", onClick);
    return () => document.removeEventListener("click", onClick);
  }, [pathname]);

  // Never leave the bar up forever if a navigation is cancelled.
  useEffect(() => {
    if (!active) return;
    const t = setTimeout(() => setActive(false), 10_000);
    return () => clearTimeout(t);
  }, [active]);

  return <ProgressBar active={active} />;
}

// ---------------------------------------------------------------------------
// Skeletons
// ---------------------------------------------------------------------------

/** A shimmering placeholder block. `dark` for use on the navy surfaces. */
export function Skeleton({
  className,
  dark = false,
}: {
  className?: string;
  dark?: boolean;
}) {
  return (
    <div
      className={cn("rounded-xl", dark ? "niki-skeleton-dark" : "niki-skeleton", className)}
      aria-hidden
    />
  );
}
