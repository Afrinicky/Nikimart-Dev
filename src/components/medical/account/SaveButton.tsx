"use client";

import { useEffect, useState, useTransition } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Heart, Loader2 } from "lucide-react";
import { savedProductState, toggleSavedProduct } from "@/lib/medical/account/actions";
import { cn } from "@/lib/cn";

/**
 * Save a product, or take it off the list.
 *
 * One control with two states rather than two controls, and the state it
 * settles on is the server's answer rather than the opposite of what it was
 * showing. An optimistic flip would be wrong exactly when it matters — when
 * the save failed — and this is one request on a deliberate click, not a
 * keystroke, so there is nothing to hide behind optimism.
 *
 * A visitor who is not signed in is sent to sign in and brought back here,
 * rather than told to sign in and left to find the link. `callbackUrl` is the
 * parameter the login page reads.
 */
export function SaveButton({
  productId,
  initialSaved,
  variant = "wide",
  className,
}: {
  productId: string;
  /**
   * Leave it out where the page cannot know — the product page is cached and
   * shared, so it has no session to read. The control then asks for its own
   * state once it is in the browser.
   */
  initialSaved?: boolean;
  variant?: "wide" | "icon";
  className?: string;
}) {
  const [saved, setSaved] = useState(initialSaved ?? false);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (initialSaved !== undefined) return;
    let current = true;
    savedProductState(productId)
      .then((state) => {
        if (current) setSaved(state.saved);
      })
      .catch(() => {
        // Leaving it unpressed is the safe wrong answer: clicking still asks
        // the server, which answers with the truth either way.
      });
    return () => {
      current = false;
    };
  }, [initialSaved, productId]);

  function toggle() {
    setError(null);
    start(async () => {
      const result = await toggleSavedProduct(productId);
      if (result.ok) {
        setSaved(result.saved);
        return;
      }
      if (result.needsSignIn) {
        router.push(`/login?callbackUrl=${encodeURIComponent(pathname)}`);
        return;
      }
      setError(result.error);
    });
  }

  const label = saved ? "Saved" : "Save for later";

  if (variant === "icon") {
    return (
      <button
        type="button"
        onClick={toggle}
        disabled={pending}
        aria-pressed={saved}
        aria-label={saved ? "Remove from saved products" : "Save this product"}
        title={saved ? "Remove from saved products" : "Save this product"}
        className={cn(
          "medi-focus medi-press flex h-10 w-10 items-center justify-center rounded-xl",
          saved
            ? "bg-medi-mint-100 text-medi-teal-700"
            : "text-medi-muted hover:bg-medi-mint-50 hover:text-medi-teal-700",
          className,
        )}
      >
        {pending ? (
          <Loader2 className="h-[1.125rem] w-[1.125rem] animate-spin" aria-hidden />
        ) : (
          <Heart className={cn("h-[1.125rem] w-[1.125rem]", saved && "fill-current")} aria-hidden />
        )}
      </button>
    );
  }

  return (
    <div className={className}>
      <button
        type="button"
        onClick={toggle}
        disabled={pending}
        aria-pressed={saved}
        className={cn(
          "medi-focus medi-press inline-flex h-11 items-center justify-center gap-2 rounded-lg px-4 text-sm font-semibold",
          saved
            ? "bg-medi-mint-100 text-medi-teal-700 hover:bg-medi-mint-200"
            : "bg-white text-medi-ink shadow-[inset_0_0_0_1px_var(--color-medi-rule-strong)] hover:text-medi-teal-700 hover:shadow-[inset_0_0_0_1px_var(--color-medi-teal-600)]",
        )}
      >
        {pending ? (
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
        ) : (
          <Heart className={cn("h-4 w-4", saved && "fill-current")} aria-hidden />
        )}
        {label}
      </button>
      {error ? (
        <p role="status" className="medi-meta mt-2 text-medi-danger">
          {error}
        </p>
      ) : null}
    </div>
  );
}
