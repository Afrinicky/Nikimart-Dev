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

  /**
   * Path aliases.
   *
   * The data bundles route has always been hyphenated, but the unhyphenated
   * spelling escaped into the "Buy Data Bundles" setting and from there into
   * the sidebar, the footer and the carousel — so it is out in the world on
   * shared links and in people's history. Stored settings are repaired on read
   * (see normaliseDataBundlesUrl); this catches everything already sent.
   *
   * It lives here rather than in a page that redirects because a config
   * redirect answers before any rendering happens, so there is no route to
   * resolve and nothing that can fall through to the not-found boundary.
   */
  async redirects() {
    return [
      { source: "/databundles", destination: "/data-bundles", permanent: true },
      { source: "/databundles/:path*", destination: "/data-bundles/:path*", permanent: true },
    ];
  },

  /**
   * Serving the medical business on its own hostname.
   *
   * `medicals.nickimart.com` and `/medicals` are the same application: the
   * medical tree is a second storefront inside this project, not a second
   * project, because the session, the providers and the retail `User` table are
   * shared and splitting the deployment would mean maintaining two copies of
   * all of it.
   *
   * Off until `MEDICAL_HOST` is set, so nothing about retail routing changes
   * until somebody deliberately points a hostname here. An empty value is the
   * same as unset.
   *
   * It has to be `beforeFiles`: an `afterFiles` rewrite runs after the
   * filesystem, so `/products` on the medical host would resolve to the mall's
   * own products page before this ever saw it. Running first is also what makes
   * the exclusions below load-bearing rather than tidy —
   *
   *   `_next/`  the build's own assets. Rewritten, every script 404s and the
   *             page renders unstyled and dead.
   *   `api/`    sign-in, the Paystack webhook, uploads. One API, shared.
   *   `medicals` so a link to the path form on the host form does not become
   *             `/medicals/medicals/...`.
   *   anything with a dot, which is every file in `public/` — `/logo.png`,
   *             `/favicon.ico`, `/robots.txt`. There is no `/medicals/logo.png`
   *             to rewrite them to.
   *
   * The consequence of that last one, stated because it is the surprise: a
   * medical URL containing a dot is not rewritten on this host. Catalogue slugs
   * are hyphenated, so this does not arise today, and a slug with a dot in it
   * would have to be reachable by its `/medicals/...` path.
   */
  async rewrites() {
    const medicalHost = process.env.MEDICAL_HOST?.trim();
    if (!medicalHost) return [];

    const onMedicalHost = [{ type: "host" as const, value: medicalHost }];

    return {
      beforeFiles: [
        { source: "/", has: onMedicalHost, destination: "/medicals" },
        {
          source: "/:path((?!_next/|api/|medicals)(?!.*\\.).*)",
          has: onMedicalHost,
          destination: "/medicals/:path",
        },
      ],
      afterFiles: [],
      fallback: [],
    };
  },
};

export default nextConfig;
