import { prisma } from "@/lib/prisma";
import { isSafeImageUrl } from "@/lib/product-form";

/**
 * Replaces a product's gallery images with the given ordered URL list.
 * Re-validates here as well as at parse time — this is the last point before
 * the URLs are persisted and later rendered into an <img src>.
 */
export async function syncProductImages(productId: string, urls: string[]): Promise<void> {
  const safe = urls.filter(isSafeImageUrl);
  await prisma.productImage.deleteMany({ where: { productId } });
  if (safe.length) {
    await prisma.productImage.createMany({
      data: safe.map((url, i) => ({ productId, url, order: i })),
    });
  }
}
