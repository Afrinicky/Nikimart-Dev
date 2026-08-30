import "server-only";
import { prisma } from "@/lib/prisma";
import { ABROAD_TYPES, parseAbroadTerms, type AbroadTerms } from "@/lib/abroad";
import {
  emptyBreakdown,
  priceAbroadLine,
  sumBreakdowns,
  type AbroadCostBreakdown,
} from "@/lib/abroad-costs";
import { resolveArrivalRate, type ArrivalPointConfig } from "@/lib/arrival-points";
import { getArrivalPointMap } from "@/lib/arrival-points-data";
import { getAbroadConfig, getShippingRates } from "@/lib/settings";
import { itemCbm, lineShippingFee, routeRatePerCbm, DEFAULT_ITEM_CBM } from "@/lib/shipping";

/**
 * Pricing a cart that may contain imported items.
 *
 * One function, used by the checkout estimate and by the order action, because
 * the alternative — a client-side estimate and a separate server-side re-price
 * that drift apart — is how a buyer gets quoted one number and charged another.
 * The client never computes any of this; it renders what this returns.
 *
 * Leg 3 is the interesting join. A domestic line ships from its seller's hub;
 * an imported one ships from wherever it landed, which is the *listing's* Ghana
 * arrival point, not a site-wide setting. So the domestic leg is priced from
 * that point's hub, per line, rather than once for the whole cart.
 */

export interface PricedLineInput {
  productId: string;
  quantity: number;
}

export interface PricedLine {
  productId: string;
  name: string;
  quantity: number;
  unitPrice: number;
  /** True when this line is a shipped-from-abroad listing with terms. */
  abroad: boolean;
  terms: AbroadTerms | null;
  arrivalPoint: ArrivalPointConfig | null;
  bill: AbroadCostBreakdown;
  /** Per-unit CBM, for the cart's volume readout. */
  cbm: number;
  /** The seller's own hub, for a domestic line. */
  originHubId: string | null;
  /** The origin the line actually ships from (listing over vendor). */
  originCountry: string;
  /** True when the listing expects a leg-2 rate the admin hasn't configured. */
  unpricedRoute: boolean;
}

export interface CartPricing {
  lines: PricedLine[];
  bill: AbroadCostBreakdown;
  hasAbroad: boolean;
  /** True when any imported line permits the goods-only plan. */
  partialPaymentAvailable: boolean;
  /** True when some line's international route has no rate configured. */
  unpricedRoute: boolean;
  totalCbm: number;
}

/** The product fields pricing needs. */
const PRODUCT_SELECT = {
  id: true,
  name: true,
  price: true,
  cbm: true,
  lengthCm: true,
  widthCm: true,
  heightCm: true,
  shippingWeightKg: true,
  productType: true,
  preorderInfo: true,
  originCountry: true,
  arrivalPointId: true,
  vendor: { select: { originPickupId: true, originCountry: true } },
} as const;

type PricedProduct = {
  id: string;
  name: string;
  price: number;
  cbm: number;
  lengthCm: number;
  widthCm: number;
  heightCm: number;
  shippingWeightKg: number;
  productType: string;
  preorderInfo: string | null;
  originCountry: string;
  arrivalPointId: string | null;
  vendor: { originPickupId: string | null; originCountry: string } | null;
};

/**
 * The origin a line actually ships from.
 *
 * The listing wins over the shop. A seller in Accra dropshipping from Guangzhou
 * has a GH vendor and a CN product, and reading the vendor alone priced every
 * such listing as a domestic delivery — the exact case this feature exists for.
 */
export function effectiveOrigin(product: {
  originCountry: string;
  vendor?: { originCountry: string } | null;
}, terms: AbroadTerms | null): string {
  return (terms?.originCountry || product.originCountry || product.vendor?.originCountry || "GH").toUpperCase();
}

const EMPTY_PRICING: CartPricing = {
  lines: [],
  bill: emptyBreakdown(),
  hasAbroad: false,
  partialPaymentAvailable: false,
  unpricedRoute: false,
  totalCbm: 0,
};

/** Everything the maths needs, fetched once. */
interface PricingContext {
  products: Map<string, PricedProduct>;
  arrivalPoints: Map<string, ArrivalPointConfig>;
  rates: Awaited<ReturnType<typeof getShippingRates>>;
  config: Awaited<ReturnType<typeof getAbroadConfig>>;
}

async function loadContext(productIds: string[]): Promise<PricingContext> {
  const [products, arrivalPoints, rates, config] = await Promise.all([
    prisma.product.findMany({ where: { id: { in: productIds } }, select: PRODUCT_SELECT }),
    getArrivalPointMap(),
    getShippingRates(),
    getAbroadConfig(),
  ]);
  return {
    products: new Map((products as PricedProduct[]).map((p) => [p.id, p])),
    arrivalPoints,
    rates,
    config,
  };
}

/**
 * Price a cart, whole.
 *
 * `destPickupId` is the buyer's chosen pickup point. Pass an empty string to
 * price everything except leg 3 — that is the shape the checkout page needs
 * while it is still asking the buyer where they want to collect.
 */
export async function priceCart(
  items: PricedLineInput[],
  destPickupId: string,
): Promise<CartPricing> {
  const wanted = items.filter((i) => i.productId && i.quantity > 0).slice(0, 200);
  if (wanted.length === 0) return EMPTY_PRICING;
  const ctx = await loadContext([...new Set(wanted.map((i) => i.productId))]);
  return priceWith(ctx, wanted, destPickupId);
}

/**
 * Price the same cart at several destinations at once.
 *
 * Checkout quotes every active pickup point so the buyer can compare them, and
 * doing that by calling `priceCart` per point re-read the products, the arrival
 * points and the rate tables once each time. The lookups are identical for
 * every destination — only leg 3 moves — so they are loaded once here and the
 * maths is re-run per point.
 */
export async function priceCartAtPoints(
  items: PricedLineInput[],
  destPickupIds: string[],
): Promise<{ base: CartPricing; byPoint: Map<string, CartPricing> }> {
  const wanted = items.filter((i) => i.productId && i.quantity > 0).slice(0, 200);
  if (wanted.length === 0) return { base: EMPTY_PRICING, byPoint: new Map() };

  const ctx = await loadContext([...new Set(wanted.map((i) => i.productId))]);
  const byPoint = new Map<string, CartPricing>();
  for (const id of destPickupIds) byPoint.set(id, priceWith(ctx, wanted, id));
  // Priced with no destination: what describes the cart itself, which does not
  // change with the pickup point.
  return { base: priceWith(ctx, wanted, ""), byPoint };
}

function priceWith(
  { products: byId, arrivalPoints, rates, config }: PricingContext,
  wanted: PricedLineInput[],
  destPickupId: string,
): CartPricing {
  const lines: PricedLine[] = [];
  for (const want of wanted) {
    const p = byId.get(want.productId);
    if (!p) continue;

    const isAbroadListing = (ABROAD_TYPES as readonly string[]).includes(p.productType);
    const terms = isAbroadListing ? parseAbroadTerms(p.preorderInfo) : null;
    const origin = effectiveOrigin(p, terms);
    const cbm = itemCbm(p);
    const quantity = Math.max(1, Math.round(want.quantity));

    // The Ghana point this listing lands at: the terms' choice, else the
    // column, else nothing (in which case the site-wide arrival hub is used and
    // international freight falls back to the old flat CBM engine).
    const point =
      arrivalPoints.get(terms?.arrivalPointId || p.arrivalPointId || "") ?? null;

    // Leg 3. An imported line starts from its arrival point's hub; a domestic
    // one from the seller's own hub. With no destination chosen yet, it is 0
    // and the caller re-prices once the buyer picks a pickup point.
    const domesticFreight = destPickupId
      ? abroad(origin) && point
        ? domesticLeg(cbm, quantity, point.hubPickupId ?? rates.arrivalHubId, destPickupId, rates)
        : lineShippingFee(
            { cbm, quantity, originHubId: p.vendor?.originPickupId ?? null, originCountry: origin },
            destPickupId,
            rates,
          )
      : 0;

    if (!terms || !abroad(origin)) {
      lines.push({
        productId: p.id,
        name: p.name,
        quantity,
        unitPrice: p.price,
        abroad: false,
        terms: null,
        arrivalPoint: null,
        bill: emptyBreakdown(p.price * quantity, domesticFreight),
        cbm,
        originHubId: p.vendor?.originPickupId ?? null,
        originCountry: origin,
        unpricedRoute: false,
      });
      continue;
    }

    const rate = point ? resolveArrivalRate(point, origin, terms.freightMode) : null;
    const bill = priceAbroadLine({
      unitPrice: p.price,
      quantity,
      cbm,
      weightKg: p.shippingWeightKg || 0,
      terms,
      rate,
      dutyPercent: point?.dutyPercent ?? config.defaultDutyPercent,
      clearingFee: point?.clearingFee ?? 0,
      defaultGhanaTaxRate: config.ghanaTaxRate,
      domesticFreight,
    });

    lines.push({
      productId: p.id,
      name: p.name,
      quantity,
      unitPrice: p.price,
      abroad: true,
      terms,
      arrivalPoint: point,
      bill,
      cbm,
      originHubId: p.vendor?.originPickupId ?? null,
      originCountry: origin,
      unpricedRoute: bill.unpricedRoute,
    });
  }

  const bill = sumBreakdowns(lines.map((l) => l.bill));
  const abroadLines = lines.filter((l) => l.abroad);

  return {
    lines,
    bill,
    hasAbroad: abroadLines.length > 0,
    // The plan is offered only when the platform allows it AND every imported
    // line does. A mixed cart where one seller insists on payment in full has
    // no coherent "pay the goods only" — the deferred bill would be partial.
    partialPaymentAvailable:
      config.partialPaymentEnabled &&
      abroadLines.length > 0 &&
      abroadLines.every((l) => l.terms?.allowFreightOnArrival),
    unpricedRoute: lines.some((l) => l.unpricedRoute),
    totalCbm:
      Math.round(
        lines.reduce((s, l) => s + (l.cbm > 0 ? l.cbm : DEFAULT_ITEM_CBM) * l.quantity, 0) * 1000,
      ) / 1000,
  };
}

function abroad(code: string): boolean {
  return Boolean(code) && code !== "GH";
}

/** Leg 3 for an imported line: its arrival point's hub → the buyer's pickup. */
function domesticLeg(
  cbm: number,
  quantity: number,
  hubId: string | null,
  destPickupId: string,
  rates: Awaited<ReturnType<typeof getShippingRates>>,
): number {
  const totalCbm = (cbm > 0 ? cbm : DEFAULT_ITEM_CBM) * Math.max(1, quantity);
  return Math.max(0, Math.round(routeRatePerCbm(rates, hubId, destPickupId) * totalCbm * 100) / 100);
}
