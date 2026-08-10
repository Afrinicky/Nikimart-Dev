import "server-only";
import { prisma } from "@/lib/prisma";

/**
 * Stock is reserved when an order is created and released when it is cancelled.
 *
 * Reservation happens inside the order transaction with a guarded update
 * (`stockQuantity >= quantity`), so two buyers racing for the last unit can't
 * both succeed — the loser's update matches zero rows and the whole order rolls
 * back. Only physical, in-stock products are counted; preorders, services, and
 * made-to-order food aren't limited by a shelf count.
 */
export const STOCK_TRACKED_TYPES = new Set(["in_stock"]);

export function tracksStock(productType: string): boolean {
  return STOCK_TRACKED_TYPES.has(productType);
}

/**
 * Put the units from a cancelled order back on the shelf. Idempotency is the
 * caller's job: only call this on the transition *into* cancelled, which the
 * order-status guards make a one-way door.
 */
export async function releaseStockForOrder(orderId: string): Promise<void> {
  const items = await prisma.orderItem.findMany({
    where: { orderId },
    select: { productId: true, quantity: true, product: { select: { productType: true } } },
  });
  await Promise.all(
    items
      .filter((i) => tracksStock(i.product.productType))
      .map((i) =>
        prisma.product
          .update({ where: { id: i.productId }, data: { stockQuantity: { increment: i.quantity } } })
          .catch(() => {}),
      ),
  );
}
