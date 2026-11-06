import "server-only";
import { prisma } from "@/lib/prisma";

/**
 * A product's photographs, as links — without reading a single photograph.
 *
 * The problem this solves
 * -----------------------
 * `Product.image` and `ProductImage.url` each hold either a short http(s) URL
 * or an entire photograph as a base64 `data:` URL, because the upload forms
 * downscale on the device and post the result inside the form. A 1200px JPEG
 * is roughly 250–400 KB once base64-encoded, and the storefront reads these
 * columns on every listing.
 *
 * So `SELECT … image …` over a page of forty products moved something like ten
 * megabytes out of Neon, through Prisma's deserialiser, into a cache entry too
 * large to store (Vercel refuses one over 2 MB, so the read was never actually
 * cached), and finally into the HTML and the Flight payload — twice over for
 * the gallery, which is a client component. Every step of that is CPU, it
 * happened on every request, and it grew with the size of the shop.
 *
 * What this does instead
 * ----------------------
 * The same trick `readStoredSettings` already uses for the site logo, applied
 * to the catalogue: the digest is computed *in the database* and only a few
 * dozen bytes per image come back. A value short enough to be a real URL
 * (≤512 characters) is returned whole and used as-is; anything longer is a
 * photograph, and what comes back is its md5, which becomes the `v=` on a link
 * to `/img/product/[id]`.
 *
 * The digest is what makes the link safe to cache for a year: different bytes,
 * different URL.
 */

/** One image, resolved to something a page can put in a `src`. */
export type ImageStamp = {
  /** 0-based position in the ordered gallery; 0 also covers `Product.image`. */
  index: number;
  /** The stored value when it was already a URL, else "". */
  short: string;
  /** md5 of the stored value — the cache-buster for a `data:` URL. */
  fingerprint: string;
};

type GalleryRow = { productId: string; short: string; fingerprint: string };
type PrimaryRow = { id: string; short: string; fingerprint: string };

/** The link a page should use for one stored image value. */
export function servedProductImage(
  productId: string,
  stamp: ImageStamp | undefined,
): string | undefined {
  if (!stamp) return undefined;
  // Already a URL somebody can fetch — a seller pasted a link, or the row
  // predates device uploads. Nothing to serve and nothing to rewrite.
  if (stamp.short) return stamp.short;
  if (!stamp.fingerprint) return undefined;
  const position = stamp.index > 0 ? `&i=${stamp.index}` : "";
  return `/img/product/${productId}?v=${stamp.fingerprint}${position}`;
}

/**
 * Gallery stamps for a set of products, ordered as the gallery is ordered.
 *
 * Empty for an empty input, so a page with no products never issues a query.
 * Returns a map rather than rows because every caller wants "this product's
 * images" and the join would otherwise be repeated at each call site.
 */
export async function readProductImageStamps(
  productIds: string[],
): Promise<Map<string, ImageStamp[]>> {
  const byProduct = new Map<string, ImageStamp[]>();
  if (productIds.length === 0) return byProduct;

  try {
    const [gallery, primary] = await Promise.all([
      prisma.$queryRaw<GalleryRow[]>`
        SELECT "productId",
               CASE WHEN length("url") <= 512 THEN "url" ELSE '' END AS "short",
               md5("url") AS "fingerprint"
        FROM "ProductImage"
        WHERE "productId" = ANY(${productIds})
        ORDER BY "productId", "order" ASC, "id" ASC
      `,
      prisma.$queryRaw<PrimaryRow[]>`
        SELECT "id",
               CASE WHEN length(COALESCE("image", '')) <= 512
                    THEN COALESCE("image", '') ELSE '' END AS "short",
               md5(COALESCE("image", '')) AS "fingerprint"
        FROM "Product"
        WHERE "id" = ANY(${productIds})
          AND COALESCE("image", '') <> ''
      `,
    ]);

    // The gallery comes back ordered, so position in the list *is* the index
    // `/img/product/[id]?i=` will skip to. syncProductImages writes `order`
    // densely from zero, so the two always agree.
    for (const row of gallery) {
      const list = byProduct.get(row.productId) ?? [];
      list.push({ index: list.length, short: row.short, fingerprint: row.fingerprint });
      byProduct.set(row.productId, list);
    }

    // `Product.image` is the fallback for a listing with no gallery rows — the
    // same precedence getProductImage has always applied.
    for (const row of primary) {
      if (byProduct.has(row.id)) continue;
      byProduct.set(row.id, [{ index: 0, short: row.short, fingerprint: row.fingerprint }]);
    }
  } catch {
    // A missing table or a sleeping database must not blank the catalogue; the
    // cards render their gradient-and-emoji placeholder instead.
    return byProduct;
  }

  return byProduct;
}

/** The links for one product, in gallery order. */
export function servedGallery(
  productId: string,
  stamps: ImageStamp[] | undefined,
): string[] {
  if (!stamps?.length) return [];
  return stamps
    .map((stamp) => servedProductImage(productId, stamp))
    .filter((url): url is string => Boolean(url));
}
