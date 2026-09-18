"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/**
 * Keeps an orders page current while somebody is watching it.
 *
 * A status that changes upstream is no use sitting on a screen nobody has
 * reloaded. The server re-reads open orders from the provider each time this
 * page renders, so asking it to render again is all that is needed — this is
 * the thing that asks.
 *
 * It only runs while the page is in front of somebody and only while there is
 * something still open. A tab left in the background for an hour comes back
 * current on its next frame rather than having made two hundred pointless
 * round trips, and a page of finished orders does nothing at all.
 */
export function LiveOrders({
  /** How many orders on this page are still moving. Zero means stop. */
  open,
  seconds = 20,
}: {
  open: number;
  seconds?: number;
}) {
  const router = useRouter();

  useEffect(() => {
    if (open <= 0) return;

    const tick = () => {
      if (document.visibilityState === "visible") router.refresh();
    };
    const timer = setInterval(tick, Math.max(10, seconds) * 1000);
    // Coming back to the tab should not mean waiting out the rest of an
    // interval that ran while nobody was looking.
    const onVisible = () => {
      if (document.visibilityState === "visible") router.refresh();
    };
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [open, seconds, router]);

  return null;
}
