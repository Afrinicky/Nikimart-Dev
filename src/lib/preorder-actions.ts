"use server";

import { prisma } from "@/lib/prisma";
import { parsePreorderTerms, type PreorderTerms } from "@/lib/preorder";

export interface CartPreorderItem {
  productId: string;
  name: string;
  terms: PreorderTerms;
}

/**
 * The preorder terms for whatever is in the cart.
 *
 * The cart lives in the browser and carries only ids, names and prices, so
 * checkout cannot know a line is a preorder — let alone what was promised
 * about it — without asking. This is that question, kept to the products
 * actually being bought.
 *
 * Returns only preorder products that have terms written. A preorder with no
 * terms yields nothing, so checkout stays quiet rather than showing a buyer an
 * empty box captioned "what you are agreeing to".
 */
export async function preorderTermsForCart(productIds: string[]): Promise<CartPreorderItem[]> {
  const ids = [...new Set(productIds.filter((id) => typeof id === "string" && id))].slice(0, 100);
  if (ids.length === 0) return [];

  try {
    const rows = await prisma.product.findMany({
      where: { id: { in: ids }, productType: "preorder" },
      select: { id: true, name: true, preorderInfo: true },
    });

    return rows.flatMap((r) => {
      const terms = parsePreorderTerms(r.preorderInfo);
      return terms ? [{ productId: r.id, name: r.name, terms }] : [];
    });
  } catch {
    // Checkout must not break because this lookup failed. The consequence of
    // returning nothing is that no panel is shown, which is the same position
    // the page was in before — not a blocked sale.
    return [];
  }
}
