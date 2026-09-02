"use server";

import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { freightModeLabel, type AbroadTerms } from "@/lib/abroad";
import { resolveForwarderRate } from "@/lib/shipping";
import { describePoint } from "@/lib/shipping";
import { priceCartAtPoints } from "@/lib/cart-pricing";
import type { CartBill } from "@/lib/cart-bill";

/**
 * What checkout needs to know about a cart it only has ids for.
 *
 * The cart lives in the browser and carries ids, names and prices. It cannot
 * know where a line's goods gather, that collecting at one station is free and
 * at another is not, or what an imported item's freight costs. This is that
 * question, asked once, and answered with everything the page renders.
 *
 * Prices are computed here and only here. The client renders them; it never
 * derives them, so what the buyer is shown is what the order action recomputes.
 */

const schema = z.object({
  items: z
    .array(z.object({ productId: z.string().min(1), quantity: z.number().int().min(1).max(99) }))
    .max(200),
});

/** One imported line's promises, for the acceptance panel. */
export interface CartAbroadItem {
  productId: string;
  name: string;
  quantity: number;
  terms: AbroadTerms;
  /** The Ghana point it gathers at, in words. Empty when none is configured. */
  pointName: string;
  /** "Sea freight", "Air freight"… from the forwarder carrying it. */
  freightModeLabel: string;
  /** Days in transit on the chosen route, when the price list says. */
  transitDays: number;
  /** True when nothing prices this route yet. */
  unpricedRoute: boolean;
}

/** A pickup station, and what this cart costs collected there. */
export interface PickupQuote {
  id: string;
  name: string;
  locationName: string;
  /** The shipping figure — the only one besides the goods a buyer sees. */
  fee: number;
  bill: CartBill;
  /** True when the whole cart already sits at this station. */
  collectedHere: boolean;
}

export interface CartQuote {
  points: PickupQuote[];
  items: CartAbroadItem[];
  hasAbroad: boolean;
  /** True when every seller lets the shipping be settled at collection. */
  payShippingOnPickup: boolean;
  unpricedRoute: boolean;
  totalWeightKg: number;
}

const EMPTY: CartQuote = {
  points: [],
  items: [],
  hasAbroad: false,
  payShippingOnPickup: false,
  unpricedRoute: false,
  totalWeightKg: 0,
};

/**
 * Price the cart at every active pickup station, and describe its imported lines.
 *
 * Pricing per station rather than once is what makes the choice honest: goods
 * consolidated in Kumasi cost nothing to collect in Kumasi and something to
 * collect in Accra, and a buyer choosing between them should see that before
 * they choose.
 */
export async function quoteCart(input: {
  items: { productId: string; quantity: number }[];
}): Promise<CartQuote> {
  const parsed = schema.safeParse(input);
  if (!parsed.success || parsed.data.items.length === 0) return EMPTY;

  try {
    const points = await prisma.pickupPoint.findMany({
      where: { isActive: true },
      orderBy: { name: "asc" },
      select: { id: true, name: true, locationName: true },
    });

    // Priced at every station in one pass. `base` is the same cart with no
    // destination — which lines are imported, what was promised, whether a
    // route is unpriced — none of which changes with the station.
    const { base, byPoint } = await priceCartAtPoints(
      parsed.data.items,
      points.map((p) => p.id),
    );

    const items: CartAbroadItem[] = base.lines
      .filter((l) => l.abroad && l.terms)
      .map((l) => {
        const rate = resolveForwarderRate(l.forwarder, l.categoryId);
        return {
          productId: l.productId,
          name: l.name,
          quantity: l.quantity,
          terms: l.terms!,
          pointName: l.point ? describePoint(l.point) : "",
          freightModeLabel: freightModeLabel(l.forwarder?.mode),
          transitDays: rate?.transitDays ?? 0,
          unpricedRoute: l.unpricedRoute,
        };
      });

    const quoted: PickupQuote[] = points.map((pt) => {
      const priced = byPoint.get(pt.id) ?? base;
      return {
        id: pt.id,
        name: pt.name,
        locationName: pt.locationName,
        fee: priced.bill.shipping,
        bill: priced.bill,
        collectedHere: priced.allCollectedAtOrigin,
      };
    });

    return {
      points: quoted,
      items,
      hasAbroad: base.hasAbroad,
      payShippingOnPickup: base.payShippingOnPickup,
      unpricedRoute: base.unpricedRoute,
      totalWeightKg: base.totalWeightKg,
    };
  } catch {
    // Checkout must not break because a quote failed. Returning nothing leaves
    // the page in the same position it was in before — no stations, no panel —
    // rather than a blocked sale with a stack trace behind it.
    return EMPTY;
  }
}
