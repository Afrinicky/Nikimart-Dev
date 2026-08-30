"use server";

import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { FREIGHT_MODE_LABELS, type AbroadTerms } from "@/lib/abroad";
import type { AbroadCostBreakdown } from "@/lib/abroad-costs";
import { priceCartAtPoints } from "@/lib/abroad-pricing";

/**
 * What checkout needs to know about a cart it only has ids for.
 *
 * The cart lives in the browser and carries ids, names and prices. It cannot
 * know that a line is imported, what was promised about it, or that the bill is
 * eight rows rather than two — let alone price the freight. This is that
 * question, asked once, and answered with everything the checkout page renders:
 * the terms panel, the per-pickup-point bills, and whether the goods-only plan
 * is on the table.
 *
 * Prices are computed here and only here. The client renders them; it never
 * derives them, so what the buyer is shown is what the order action recomputes.
 */

const schema = z.object({
  items: z
    .array(z.object({ productId: z.string().min(1), quantity: z.number().int().min(1).max(99) }))
    .max(200),
});

/** One imported line's terms, for the acceptance panel. */
export interface CartAbroadItem {
  productId: string;
  name: string;
  quantity: number;
  terms: AbroadTerms;
  /** The Ghana point it lands at, in words. Empty when none is configured. */
  arrivalPointName: string;
  /** "Sea freight", "Air freight"… */
  freightModeLabel: string;
  /** Days in transit on the chosen route, when the rate table says. */
  transitDays: number;
  /** True when the admin has not priced this origin/mode into that point. */
  unpricedRoute: boolean;
}

/** A pickup point, with the whole bill it produces. */
export interface PickupBill {
  id: string;
  name: string;
  locationName: string;
  /** Leg 3 alone — what the point costs to collect from. */
  fee: number;
  bill: AbroadCostBreakdown;
}

export interface CartQuote {
  points: PickupBill[];
  items: CartAbroadItem[];
  hasAbroad: boolean;
  partialPaymentAvailable: boolean;
  unpricedRoute: boolean;
  totalCbm: number;
}

const EMPTY: CartQuote = {
  points: [],
  items: [],
  hasAbroad: false,
  partialPaymentAvailable: false,
  unpricedRoute: false,
  totalCbm: 0,
};

/**
 * Price the cart at every active pickup point, and describe its imported lines.
 *
 * Pricing per point rather than once is what makes the choice honest: an
 * imported line's domestic leg starts at whichever Ghana point it landed in, so
 * two pickup points can differ by more than a rounding error, and a buyer
 * choosing between them should see that before they choose.
 */
export async function quoteCart(input: { items: { productId: string; quantity: number }[] }): Promise<CartQuote> {
  const parsed = schema.safeParse(input);
  if (!parsed.success || parsed.data.items.length === 0) return EMPTY;

  try {
    const points = await prisma.pickupPoint.findMany({
      where: { isActive: true },
      orderBy: { name: "asc" },
      select: { id: true, name: true, locationName: true },
    });

    // Priced at every point in one pass. `base` is the same cart with no
    // destination — which lines are imported, what was promised, whether a
    // route is unpriced — none of which changes with the pickup point.
    const { base, byPoint } = await priceCartAtPoints(
      parsed.data.items,
      points.map((p) => p.id),
    );

    const items: CartAbroadItem[] = base.lines
      .filter((l) => l.abroad && l.terms)
      .map((l) => {
        const rate = l.arrivalPoint?.rates.find(
          (r) =>
            (r.originCountry === l.originCountry || r.originCountry === "*") &&
            (r.mode === l.terms!.freightMode || r.mode === "*"),
        );
        return {
          productId: l.productId,
          name: l.name,
          quantity: l.quantity,
          terms: l.terms!,
          arrivalPointName: l.arrivalPoint
            ? l.arrivalPoint.city
              ? `${l.arrivalPoint.name} — ${l.arrivalPoint.city}`
              : l.arrivalPoint.name
            : "",
          freightModeLabel: FREIGHT_MODE_LABELS[l.terms!.freightMode] ?? l.terms!.freightMode,
          transitDays: rate?.transitDays ?? 0,
          unpricedRoute: l.unpricedRoute,
        };
      });

    const quoted: PickupBill[] = points.map((pt) => {
      const priced = byPoint.get(pt.id) ?? base;
      return {
        id: pt.id,
        name: pt.name,
        locationName: pt.locationName,
        fee: priced.bill.domesticFreight,
        bill: priced.bill,
      };
    });

    return {
      points: quoted,
      items,
      hasAbroad: base.hasAbroad,
      partialPaymentAvailable: base.partialPaymentAvailable,
      unpricedRoute: base.unpricedRoute,
      totalCbm: base.totalCbm,
    };
  } catch {
    // Checkout must not break because a quote failed. Returning nothing leaves
    // the page in the same position it was in before — no pickup points, no
    // panel — rather than a blocked sale with a stack trace behind it.
    return EMPTY;
  }
}
