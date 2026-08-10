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
