import type { MetadataRoute } from "next";
import { siteUrl } from "@/lib/site";

/**
 * What crawlers may walk, and — far more importantly — what they may not.
 *
 * The site had no robots.txt at all, which is not a neutral default. It means
 * every crawler on the internet is invited to walk every URL it can construct,
 * and the ones that cost us money are exactly the ones a shopper never visits:
 *
 *   /products?q=…      every search a crawler invents is a cache miss. The
 *                      route reads the query string, so it cannot be
 *                      prerendered — each distinct URL is a fresh render of
 *                      the catalogue against the database.
 *   /cart, /checkout   personal by definition: `force-dynamic`, never cached,
 *   /account, /orders  and nothing in them belongs in an index anyway.
 *   /admin, /agent,    the consoles. Hundreds of `force-dynamic` pages, each
 *   /affiliate, /seller one a full render behind a redirect to the login page.
 *   /r/…               an affiliate click. Following one records a visit and
 *                      sets a cookie; a crawler doing that is a fake click in
 *                      somebody's commission figures.
 *   /api/…             not pages.
 *
 * What is left — the homepage, the catalogue, categories, shops, the editorial
 * pages — is the part that is cached for half an hour at a time, so a crawl of
 * it costs one render per page per window rather than one render per hit.
 *
 * `crawlDelay` is advisory and the big search engines ignore it, but the
 * second-tier crawlers and SEO scrapers that generate most of this traffic do
 * honour it, and they are the ones doing the damage.
 */
export default function robots(): MetadataRoute.Robots {
  const disallow = [
    "/api/",
    "/admin",
    "/agent",
    "/affiliate",
    "/seller",
    "/freight",
    "/pickup/",
    "/account",
    "/orders",
    "/cart",
    "/checkout",
    "/login",
    "/register",
    "/agent-login",
    "/agent-setup",
    "/forgot-password",
    "/agent-forgot-password",
    "/reset-password",
    "/r/",
    // Every filtered or searched view of the catalogue. The unfiltered
    // /products, /categories/… and /shops/… pages stay crawlable: those are
    // the cached ones, and they link to every product on their own.
    "/products?",
    "/*?q=",
    "/*?category=",
    "/*?badge=",
    "/*?maxPrice=",
    "/*?ref=",
    "/*?invite=",
  ];

  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow,
      },
      // The AI and SEO crawlers. They pull far harder than a search engine and
      // send no shoppers back; the catalogue is still open to them, at a pace.
      {
        userAgent: [
          "GPTBot",
          "ClaudeBot",
          "Claude-Web",
          "anthropic-ai",
          "CCBot",
          "PerplexityBot",
          "Bytespider",
          "Amazonbot",
          "AhrefsBot",
          "SemrushBot",
          "MJ12bot",
          "DotBot",
          "PetalBot",
          "DataForSeoBot",
          "BLEXBot",
          "Barkrowler",
          "SeekportBot",
          "ImagesiftBot",
        ],
        allow: "/",
        disallow,
        crawlDelay: 30,
      },
    ],
    sitemap: `${siteUrl()}/sitemap.xml`,
    host: siteUrl(),
  };
}
