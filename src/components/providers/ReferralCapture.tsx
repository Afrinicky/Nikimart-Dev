"use client";

import { useEffect } from "react";

/**
 * Captures an affiliate referral code from `?ref=CODE` on any page and stores
 * it in a 30-day cookie, so a later purchase is credited to that affiliate.
 * Non-httpOnly by design (it's a referral code, not a secret) so it's set
 * client-side and read back server-side at checkout.
 */
export function ReferralCapture() {
  useEffect(() => {
    try {
      const ref = new URLSearchParams(window.location.search).get("ref");
      if (ref && /^[a-zA-Z0-9]{3,16}$/.test(ref)) {
        document.cookie = `nikimart_ref=${encodeURIComponent(ref.toUpperCase())}; max-age=${60 * 60 * 24 * 30}; path=/; SameSite=Lax`;
      }
    } catch {
      // ignore
    }
  }, []);
  return null;
}
