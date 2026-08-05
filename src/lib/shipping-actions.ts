"use server";

import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getShippingRates } from "@/lib/settings";
import { quoteShipping, itemCbm, totalCartCbm, type ShippingLine } from "@/lib/shipping";

const schema = z.object({
  items: z
    .array(z.object({ productId: z.string().min(1), quantity: z.number().int().min(1).max(99) }))
    .max(200),
});

export interface PickupQuote {
  id: string;
  name: string;
  locationName: string;
  fee: number;
}

export interface CartShippingQuote {
  points: PickupQuote[];
  totalCbm: number;
  /** True when any cart line ships from abroad (for the shipping note). */
  hasAbroad: boolean;
}

/**
 * Price the current cart's shipping to every active pickup point. All rate and
 * origin logic stays on the server; the client just renders the per-point fees.
 */
export async function quoteCartShipping(input: { items: { productId: string; quantity: number }[] }): Promise<CartShippingQuote> {
  const parsed = schema.safeParse(input);
  if (!parsed.success || parsed.data.items.length === 0) {
    return { points: [], totalCbm: 0, hasAbroad: false };
  }

  const ids = parsed.data.items.map((i) => i.productId);
  const [products, points, rates] = await Promise.all([
    prisma.product.findMany({
      where: { id: { in: ids } },
      select: {
        id: true,
        cbm: true,
        lengthCm: true,
        widthCm: true,
        heightCm: true,
        vendor: { select: { originPickupId: true, originCountry: true } },
      },
    }),
    prisma.pickupPoint.findMany({
      where: { isActive: true },
      orderBy: { name: "asc" },
      select: { id: true, name: true, locationName: true },
    }),
    getShippingRates(),
  ]);

  const byId = new Map(products.map((p) => [p.id, p]));
  const lines: ShippingLine[] = parsed.data.items
    .filter((i) => byId.has(i.productId))
    .map((i) => {
      const p = byId.get(i.productId)!;
      return {
        cbm: itemCbm(p),
        quantity: i.quantity,
        originHubId: p.vendor?.originPickupId ?? null,
        originCountry: p.vendor?.originCountry ?? "GH",
      };
    });

  const hasAbroad = lines.some((l) => l.originCountry && l.originCountry !== "GH");
  const quotedPoints: PickupQuote[] = points.map((pt) => ({
    id: pt.id,
    name: pt.name,
    locationName: pt.locationName,
    fee: quoteShipping(lines, pt.id, rates),
  }));

  return { points: quotedPoints, totalCbm: totalCartCbm(lines), hasAbroad };
}
