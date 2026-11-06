import type { MetadataRoute } from "next";
import { getCategories, getProductSlugs, getVendors } from "@/lib/catalog";
import { siteUrl } from "@/lib/site";

/**
 * The map robots.ts points at.
 *
 * It exists to aim a crawler rather than to invite one. Every URL here is a
 * page that is cached for half an hour (`export const revalidate = 1800`), so
 * a crawl of the whole map costs one render per page per window no matter how
 * many crawlers walk it. What robots.txt turns away — searched and filtered
 * catalogue views, the consoles, anything personal — is absent, which is the
 * point: a crawler given no map builds its own out of query strings, and those
 * are the URLs that cannot be cached.
 *
 * Cached for the same window as the pages it lists. The reads behind it are
 * slug-only (see readProductSlugs), so building it never pulls a photograph.
 */
export const revalidate = 1800;

/** A ceiling, so a runaway catalogue cannot turn this into a megabyte of XML. */
const MAX_PRODUCTS = 5000;

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = siteUrl();
  const now = new Date();

  const [categories, vendors, productSlugs] = await Promise.all([
    getCategories().catch(() => []),
    getVendors().catch(() => []),
    getProductSlugs(MAX_PRODUCTS).catch(() => []),
  ]);

  const entry = (
    path: string,
    changeFrequency: MetadataRoute.Sitemap[number]["changeFrequency"],
    priority: number,
  ) => ({ url: `${base}${path}`, lastModified: now, changeFrequency, priority });

  return [
    entry("/", "daily", 1),
    entry("/products", "daily", 0.9),
    entry("/categories", "weekly", 0.7),
    entry("/shops", "weekly", 0.7),
    entry("/shipped-from-abroad", "weekly", 0.6),
    entry("/global-shopping", "weekly", 0.5),
    entry("/campus", "weekly", 0.5),
    entry("/services", "weekly", 0.5),
    entry("/preorders", "weekly", 0.5),
    entry("/pickup-points", "monthly", 0.4),
    entry("/how-it-works", "monthly", 0.4),
    entry("/buyer-protection", "monthly", 0.4),
    entry("/help", "monthly", 0.4),
    entry("/start-selling", "monthly", 0.4),
    ...categories.map((c) => entry(`/categories/${c.slug}`, "daily", 0.8)),
    ...vendors.map((v) => entry(`/shops/${v.slug}`, "weekly", 0.6)),
    ...productSlugs.map((slug) => entry(`/products/${slug}`, "weekly", 0.7)),
  ];
}
