import type { NextConfig } from "next";

/**
 * Response headers applied to every route.
 *
 * These are the low-risk hardening headers — they don't restrict what the app
 * may load, only how browsers treat what it sends. A full Content-Security-
 * Policy is deliberately left out: product images can be `data:` URLs and the
 * app relies on inline styles, so a CSP needs its own nonce plumbing rather
 * than a blanket rule bolted on here.
 */
const securityHeaders = [
  // Don't let the site be framed — blocks clickjacking of the dashboards.
  { key: "X-Frame-Options", value: "DENY" },
  // Never let a browser second-guess a declared Content-Type.
  { key: "X-Content-Type-Options", value: "nosniff" },
  // Send the origin (not the full path) to third parties; order numbers and
  // reset links live in paths and shouldn't leak through Referer.
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  // No page here needs camera, microphone, or geolocation.
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=()" },
  // Keep this origin out of other sites' cross-origin windows.
  { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
];

const nextConfig: NextConfig = {
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;
