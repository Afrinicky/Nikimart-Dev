"use client";

import { useEffect, useRef } from "react";
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
 *
 * Why it backs off
 * ----------------
 * `router.refresh()` is not a cheap poll. It is a full server render of a
 * `force-dynamic` route — every query the page makes, plus the call out to the
 * provider — and the result is thrown away whenever nothing has changed, which
 * is nearly always. A fixed twenty-second tick meant one person with the page
 * open through a working day asked for about fifteen hundred of those.
 *
 * So the first few ticks keep the original cadence, when a just-placed order is
 * genuinely moving, and the interval then doubles towards a ceiling. After the
 * ceiling it keeps checking, slowly, indefinitely — a page that has been open
 * for an hour is almost certainly forgotten, and the visibility handler below
 * is what makes it correct the moment anyone looks at it again.
 */
export function LiveOrders({
  /** How many orders on this page are still moving. Zero means stop. */
  open,
  seconds = 20,
  /**
   * Settings → Performance → "Refresh orders screens automatically". Off, this
   * component does nothing at all and the page is current as of the moment it
   * was opened — which is what a reload is for.
   */
  enabled = true,
}: {
  open: number;
  seconds?: number;
  enabled?: boolean;
}) {
  const router = useRouter();
  // Refreshing on becoming visible is the useful half of this, but a tab that
  // is switched to repeatedly should not re-render the page each time.
  const lastRefresh = useRef(0);

  useEffect(() => {
    if (!enabled || open <= 0) return;

    const base = Math.max(10, seconds) * 1000;
    const ceiling = 5 * 60 * 1000;
    let delay = base;
    let timer: ReturnType<typeof setTimeout>;

    const refresh = () => {
      lastRefresh.current = Date.now();
      router.refresh();
    };

    const tick = () => {
      if (document.visibilityState === "visible") refresh();
      // Whether or not this tick did anything, the next one waits longer. A
      // page open long enough to reach the ceiling is a page nobody is reading.
      delay = Math.min(delay * 2, ceiling);
      timer = setTimeout(tick, delay);
    };
    timer = setTimeout(tick, delay);

    // Coming back to the tab should not mean waiting out the rest of an
    // interval that ran while nobody was looking — but flicking between two
    // tabs should not re-render the page on every flick either.
    const onVisible = () => {
      if (document.visibilityState !== "visible") return;
      if (Date.now() - lastRefresh.current < base) return;
      refresh();
      // Somebody is here and looking, so start the ladder again from the
      // bottom: this is exactly when an update is worth having quickly.
      delay = base;
      clearTimeout(timer);
      timer = setTimeout(tick, delay);
    };
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [enabled, open, seconds, router]);

  return null;
}
