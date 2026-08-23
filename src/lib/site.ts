// The canonical, absolute base URL of the site. Open Graph / link-preview
// images and URLs must be absolute, so metadata and the OG image routes use
// this. Override with NEXT_PUBLIC_SITE_URL (e.g. a custom domain); otherwise it
// falls back to the production Vercel domain.
export function siteUrl(): string {
  const env = process.env.NEXT_PUBLIC_SITE_URL?.trim();
  if (env) return env.replace(/\/+$/, "");
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
 * Deliberately not derived from the request. `Host` and `X-Forwarded-Host` are
 * whatever the caller sent: a request carrying `X-Forwarded-Host: evil.test`
 * would otherwise have Paystack redirect the payer — mid-checkout, holding a
 * live order reference — to somebody else's site. Only sources the deployment
 * controls are trusted, in order of how specific they are:
 *
 *   1. NEXT_PUBLIC_SITE_URL — the canonical domain, set deliberately.
 *   2. VERCEL_URL — this exact deployment, set by the platform, so preview
 *      builds return to themselves instead of to production.
 *   3. localhost — development, where there is no deployment to ask.
 */
export function callbackOrigin(): string {
  const env = process.env.NEXT_PUBLIC_SITE_URL?.trim();
  if (env) return env.replace(/\/+$/, "");

  const vercel = process.env.VERCEL_URL?.trim();
  if (vercel) return `https://${vercel.replace(/^https?:\/\//, "").replace(/\/+$/, "")}`;

  const port = process.env.PORT?.trim() || "3000";
  return `http://localhost:${port}`;
}
