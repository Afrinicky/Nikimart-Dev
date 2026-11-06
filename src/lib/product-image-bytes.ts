import "server-only";
import { unstable_cache } from "next/cache";
import { prisma } from "@/lib/prisma";
import { CACHE_BACKSTOP_LONG } from "@/lib/cache-windows";
import { PRODUCTS_TAG } from "@/lib/catalog";

/**
 * The bytes of one product photograph.
 *
 * The only place in the application that deliberately pulls a `data:` URL out
 * of the database — and it is reached once per photograph per browser, by
 * `/img/product/[id]`, rather than on every page render. Everything else goes
 * through `servedProductImage`, which hands out a link to that route and never
 * touches the bytes.
 *
 * The long window is the right one here: the answer is addressed by a URL that
 * carries a digest of these very bytes, so a changed photograph is a changed
 * URL and this entry is never stale for a request that asks for it.
 *
 * One image at a time, keyed by product and position, so the cached entry is a
 * single photograph and stays well under the 2 MB an entry may hold.
 */
export const readProductImageBytes = unstable_cache(
  async (productId: string, index: number): Promise<string | null> => {
    const gallery = await prisma.productImage.findMany({
      where: { productId },
      orderBy: { order: "asc" },
      select: { url: true },
      skip: index,
      take: 1,
    });
    if (gallery[0]?.url) return gallery[0].url;

    // Position 0 falls back to the legacy single-image column; a gallery
    // position that does not exist does not.
    if (index > 0) return null;
    const row = await prisma.product.findUnique({
      where: { id: productId },
      select: { image: true },
    });
    return row?.image ?? null;
  },
  ["product-image-bytes"],
  { tags: [PRODUCTS_TAG], revalidate: CACHE_BACKSTOP_LONG },
);
