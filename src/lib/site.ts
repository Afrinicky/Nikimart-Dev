/**
 * The canonical, absolute base URL of the site.
 *
 * Open Graph / link-preview images and canonical URLs must be absolute, so
 * metadata and the OG image routes are built from this. It resolves in the
 * same order of deliberateness as `callbackOrigin()` below, and for the same
 * reason: the two must never disagree about what this site is called.
 *
 *   1. NEXT_PUBLIC_SITE_URL — set by hand, wins over everything. Point this at
 *      the custom domain and every link preview follows it.
 *   2. VERCEL_PROJECT_PRODUCTION_URL — the project's production domain, from
 *      the platform. Once a custom domain is the production domain, previews
 *      and OG cards pick it up with no redeploy of this file.
 *   3. The built-in fallback, for anywhere neither is set.
 *
 * Never VERCEL_URL: that is the per-deployment address, which sits behind
 * Vercel's own login wall (see the note on callbackOrigin).
 */
export function siteUrl(): string {
  const env = process.env.NEXT_PUBLIC_SITE_URL?.trim();
  if (env) return env.replace(/\/+$/, "");

  const production = process.env.VERCEL_PROJECT_PRODUCTION_URL?.trim();
  if (production) {
    return `https://${production.replace(/^https?:\/\//, "").replace(/\/+$/, "")}`;
  }

  return "https://nikimart.vercel.app";
}

/** Make a stored image reference absolute, or null if it can't be used. */
export function absoluteImageUrl(src: string | null | undefined): string | null {
  if (!src) return null;
  const s = src.trim();
  if (!s) return null;
  if (s.startsWith("http://") || s.startsWith("https://") || s.startsWith("data:")) return s;
  if (s.startsWith("/")) return `${siteUrl()}${s}`;
  return null;
}

/**
 * The origin to hand a payment provider as a return address.
 *
 * Not derived from the request. `Host` and `X-Forwarded-Host` are whatever the
 * caller sent, and a request carrying `X-Forwarded-Host: evil.test` would have
 * Paystack redirect the payer — mid-checkout, holding a live order reference —
 * to somebody else's site.
 *
 * And explicitly never VERCEL_URL. That is the per-deployment address
 * (project-hash-team.vercel.app), which Vercel puts behind its own login wall.
 * A buyer who had just paid was handed back to it and met "Log in to Vercel"
 * instead of their receipt. It names a real deployment, so it looked like the
 * safe choice; it is simply not a URL a customer can reach.
 *
 * What is left is the canonical domain, in order of how deliberately it was
 * set:
 *
 *   1. NEXT_PUBLIC_SITE_URL — set by hand, wins over everything.
 *   2. VERCEL_PROJECT_PRODUCTION_URL — the project's production domain, from
 *      the platform. Stable, public, and the same on every deployment, so a
 *      preview returns the payer somewhere they can actually load.
 *   3. The built-in canonical domain, for anywhere neither is set.
 *   4. localhost, in development, where there is no deployment to ask.
 */
export function callbackOrigin(): string {
  const explicit = process.env.NEXT_PUBLIC_SITE_URL?.trim();
  if (explicit) return explicit.replace(/\/+$/, "");

  const production = process.env.VERCEL_PROJECT_PRODUCTION_URL?.trim();
  if (production) {
    return `https://${production.replace(/^https?:\/\//, "").replace(/\/+$/, "")}`;
  }

  // On the platform but with no domain configured: the canonical one from
  // siteUrl() is still reachable, which the deployment URL is not.
  if (process.env.VERCEL) return siteUrl();

  const port = process.env.PORT?.trim() || "3000";
  return `http://localhost:${port}`;
}
