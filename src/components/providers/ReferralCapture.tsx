"use client";

import { useEffect } from "react";

/**
 * Captures an affiliate referral code from `?ref=CODE` on any page and stores
 * it in a 30-day cookie, so a later purchase is credited to that affiliate.
 * Non-httpOnly by design (it's a referral code, not a secret) so it's set
 * client-side and read back server-side at checkout.
 *
 * The cookie is written here first and the server is told afterwards. The
 * order matters: the cookie is what checkout falls back on, and it has to be
 * in place even if the visitor closes the tab before the request lands. The
 * server call then gives the visit a real attribution row — one that carries
 * its own expiry, counts as a click in the affiliate's figures, and survives
 * the cookie being cleared.
 *
 * Links minted by the affiliate console go through `/r/<code>` instead, which
 * does all of this on the server before the page is even served. This path is
 * for a code that travelled on its own: printed on a flyer, typed into a bio.
 */
export function ReferralCapture() {
  useEffect(() => {
    try {
      const ref = new URLSearchParams(window.location.search).get("ref");
      if (ref && /^[a-zA-Z0-9]{3,16}$/.test(ref)) {
        const code = ref.toUpperCase();
        document.cookie = `nikimart_ref=${encodeURIComponent(code)}; max-age=${60 * 60 * 24 * 30}; path=/; SameSite=Lax`;
        void fetch("/api/affiliate/track", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ code, path: window.location.pathname }),
          keepalive: true,
        }).catch(() => {
          // The cookie above is already set, so the referral still counts at
          // checkout. Nothing to tell the visitor about.
        });
      }
    } catch {
      // ignore
    }
  }, []);
  return null;
}
