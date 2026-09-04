"use server";

import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { freightModeLabel, type AbroadTerms } from "@/lib/abroad";
import { describePoint, describeTransit } from "@/lib/shipping";
import { priceCartAtPoints } from "@/lib/cart-pricing";
import type { CartBill } from "@/lib/cart-bill";

/**
 * What checkout needs to know about a cart it only has ids for.
 *
 * The cart lives in the browser and carries ids, names and prices. It cannot
 * know where a line's goods gather, that collecting at one station is free and
 * at another is not, what an imported item's freight costs, or which lanes the
 * forwarder carrying it actually sells. This is that question, asked once, and
 * answered with everything the page renders.
 *
 * Prices are computed here and only here. The client renders them; it never
 * derives them, so what the buyer is shown is what the order action recomputes.
 */

const schema = z.object({
  items: z
    .array(z.object({ productId: z.string().min(1), quantity: z.number().int().min(1).max(9999) }))
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
  /** "Sea freight", "Air freight"… from the route carrying it. */
  freightModeLabel: string;
  /** The route it travels on, in words. */
  routeLabel: string;
  /** "35–45 days" on the chosen route. Empty when nothing says. */
  transit: string;
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

/** One seller's consignment, so the buyer can see why the fee is what it is. */
export interface ConsignmentLine {
  sellerName: string;
  units: number;
  baseFee: number;
  incrementFee: number;
  fee: number;
  collectedAtOrigin: boolean;
}

/** A line the buyer asked for fewer units of than the seller sells. */
export interface MoqWarning {
  productId: string;
  name: string;
  moq: number;
}

export interface CartQuote {
  points: PickupQuote[];
  items: CartAbroadItem[];
  /** How the courier run splits between sellers, at the selected station. */
  consignments: ConsignmentLine[];
  hasAbroad: boolean;
  /** True when every seller lets the shipping be settled at collection. */
  payShippingOnPickup: boolean;
  unpricedRoute: boolean;
  /** Quantities that were raised to a listing's minimum. */
  moqAdjustments: MoqWarning[];
  totalWeightKg: number;
}

const EMPTY: CartQuote = {
  points: [],
  items: [],
  consignments: [],
  hasAbroad: false,
  payShippingOnPickup: false,
  unpricedRoute: false,
  moqAdjustments: [],
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
  /** The station the buyer has selected, for the per-seller breakdown. */
  destPickupId?: string;
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
      .map((l) => ({
        productId: l.productId,
        name: l.name,
        quantity: l.quantity,
        terms: l.terms!,
        pointName: l.point ? describePoint(l.point) : "",
        freightModeLabel: freightModeLabel(l.route?.mode),
        routeLabel: l.route?.name || "",
        transit: l.route ? describeTransit(l.route.minDays, l.route.maxDays) : "",
        unpricedRoute: l.unpricedRoute,
      }));

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

    // The per-seller breakdown, at the station the buyer is looking at. It is
    // the answer to "why am I paying two base fees?" — because two shops are
    // handing over two loads.
    const selected =
      (input.destPickupId ? byPoint.get(input.destPickupId) : undefined) ??
      byPoint.get(points[0]?.id ?? "") ??
      base;
    const vendorIds = [...new Set(selected.consignments.map((c) => c.vendorId))];
    const vendorNames = new Map(
      (
        await prisma.vendor.findMany({
          where: { id: { in: vendorIds } },
          select: { id: true, businessName: true },
        })
      ).map((v) => [v.id, v.businessName] as const),
    );
    const consignments: ConsignmentLine[] = selected.consignments
      .filter((c) => c.fee > 0 || c.collectedAtOrigin)
      .map((c) => ({
        sellerName: vendorNames.get(c.vendorId) ?? "Seller",
        units: c.units,
        baseFee: c.baseFee,
        incrementFee: c.incrementFee,
        fee: c.fee,
        collectedAtOrigin: c.collectedAtOrigin,
      }));

    return {
      points: quoted,
      items,
      consignments,
      hasAbroad: base.hasAbroad,
      payShippingOnPickup: base.payShippingOnPickup,
      unpricedRoute: base.unpricedRoute,
      moqAdjustments: base.lines
        .filter((l) => l.belowMoq)
        .map((l) => ({ productId: l.productId, name: l.name, moq: l.moq })),
      totalWeightKg: base.totalWeightKg,
    };
  } catch {
    // Checkout must not break because a quote failed. Returning nothing leaves
    // the page in the same position it was in before — no stations, no panel —
    // rather than a blocked sale with a stack trace behind it.
    return EMPTY;
  }
}
