import { prisma } from "@/lib/prisma";

/** Replaces a product's gallery images with the given ordered URL list. */
export async function syncProductImages(productId: string, urls: string[]): Promise<void> {
  await prisma.productImage.deleteMany({ where: { productId } });
  if (urls.length) {
    await prisma.productImage.createMany({
      data: urls.map((url, i) => ({ productId, url, order: i })),
    });
  }
}
