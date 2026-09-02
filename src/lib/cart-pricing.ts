import "server-only";
import { prisma } from "@/lib/prisma";
import { ABROAD_TYPES, parseAbroadTerms, type AbroadTerms } from "@/lib/abroad";
import {
  isImported,
  isShippingMethod,
  priceLine,
  sumShipping,
  type ConsolidationPoint,
  type Forwarder,
  type LineShipping,
  type ShipmentLine,
  type ShippingConfig,
  type ShippingMethod,
} from "@/lib/shipping";
import {
  getConsolidationPointMap,
  getForwarderMap,
  getShippingConfig,
} from "@/lib/shipping-config";
import { getAbroadConfig } from "@/lib/settings";
import { emptyBill, type CartBill } from "@/lib/cart-bill";

/**
 * Pricing a cart.
 *
 * One function, used by the checkout quote and by the order action, because the
 * alternative — a client-side estimate and a separate server-side re-price that
 * drift apart — is how a buyer gets quoted one number and charged another. The
 * client never computes any of this; it renders what this returns.
 *
 * What a buyer sees is two numbers: what the goods cost and what it costs to
 * put them in their hands. The freight legs, the duty, the clearing and the two
 * tax jurisdictions are all real and all charged, and all of them are inside
 * that second number. They are kept, itemised, on the bill's `components` — an
 * admin has to be able to answer "why GH₵240?", a seller's payout must not be
 * computed off freight they never charged, and the finance reports need to tell
 * a courier run from a customs bill. None of it is ever a row on a buyer's
 * screen.
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
  goods: number;
  /** The one shipping figure for this line. */
  shipping: number;
  /** True when this line is a shipped-from-abroad listing with terms. */
  abroad: boolean;
  terms: AbroadTerms | null;
  point: ConsolidationPoint | null;
  forwarder: Forwarder | null;
  method: ShippingMethod;
  categoryId: string;
  /** The full breakdown behind `shipping`. Never shown to a buyer. */
  detail: LineShipping;
  originCountry: string;
  /** True when this seller lets the shipping be settled at collection. */
  shippingOnPickup: boolean;
  /** True when the goods already sit at the station the buyer chose. */
  collectedAtOrigin: boolean;
  /** True when the listing expects international freight nobody has priced. */
  unpricedRoute: boolean;
}

export interface CartPricing {
  lines: PricedLine[];
  bill: CartBill;
  hasAbroad: boolean;
  /** True when every line's seller lets the shipping be settled at collection. */
  payShippingOnPickup: boolean;
  /** True when some line's international route has no price configured. */
  unpricedRoute: boolean;
  /** Total billable weight of the cart (kg), for the courier readout. */
  totalWeightKg: number;
  /** Total cubic metres of the imported part, for the freight readout. */
  totalCbm: number;
  /** True when nothing has to move — the whole cart is already at the station. */
  allCollectedAtOrigin: boolean;
}

function round(n: number): number {
  return Math.max(0, Math.round(n * 100) / 100);
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
  categoryId: true,
  shippingMethod: true,
  manualShippingFee: true,
  supplierDelivers: true,
  forwarderId: true,
  shippingOnPickup: true,
  supplierFreight: true,
  originTaxRate: true,
  ghanaTaxRate: true,
  vendor: {
    select: { originPickupId: true, originCountry: true, consolidationPointId: true },
  },
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
  categoryId: string;
  shippingMethod: string;
  manualShippingFee: number;
  supplierDelivers: boolean;
  forwarderId: string | null;
  shippingOnPickup: boolean;
  supplierFreight: number;
  originTaxRate: number;
  ghanaTaxRate: number | null;
  vendor: {
    originPickupId: string | null;
    originCountry: string;
    consolidationPointId: string | null;
  } | null;
};

/**
 * The origin a line actually ships from.
 *
 * The listing wins over the shop. A seller in Accra dropshipping from Guangzhou
 * has a GH vendor and a CN product, and reading the vendor alone priced every
 * such listing as a domestic delivery — the exact case this feature exists for.
 */
export function effectiveOrigin(
  product: { originCountry: string; vendor?: { originCountry: string } | null },
  terms: AbroadTerms | null,
): string {
  return (
    terms?.originCountry ||
    product.originCountry ||
    product.vendor?.originCountry ||
    "GH"
  ).toUpperCase();
}

const EMPTY_PRICING: CartPricing = {
  lines: [],
  bill: emptyBill(),
  hasAbroad: false,
  payShippingOnPickup: false,
  unpricedRoute: false,
  totalWeightKg: 0,
  totalCbm: 0,
  allCollectedAtOrigin: false,
};

/** Everything the maths needs, fetched once. */
interface PricingContext {
  products: Map<string, PricedProduct>;
  points: Map<string, ConsolidationPoint>;
  forwarders: Map<string, Forwarder>;
  shipping: ShippingConfig;
  payOnPickupEnabled: boolean;
  /** The point a listing with none of its own falls back to. */
  defaultPointId: string | null;
}

async function loadContext(productIds: string[]): Promise<PricingContext> {
  const [products, points, forwarders, shipping, abroad] = await Promise.all([
    prisma.product.findMany({ where: { id: { in: productIds } }, select: PRODUCT_SELECT }),
    getConsolidationPointMap(),
    getForwarderMap(),
    getShippingConfig(),
    getAbroadConfig(),
  ]);
  return {
    products: new Map((products as PricedProduct[]).map((p) => [p.id, p])),
    points,
    forwarders,
    shipping,
    payOnPickupEnabled: abroad.payOnPickupEnabled,
    defaultPointId: abroad.defaultPointId,
  };
}

/**
 * Price a cart, whole.
 *
 * `destPickupId` is the buyer's chosen pickup point. Pass an empty string to
 * price everything except the courier run — that is the shape the checkout page
 * needs while it is still asking the buyer where they want to collect.
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
 * doing that by calling `priceCart` per point re-read the products, the points
 * and the rules once each time. The lookups are identical for every
 * destination — only the courier run moves — so they are loaded once here and
 * the maths is re-run per point.
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

/**
 * Where a listing's goods gather.
 *
 * The listing's own point, then the shop's default, then the platform's. A
 * seller who set their shop's point once should not have to answer for every
 * product, and a listing that answers for itself must win over both.
 */
function resolvePoint(p: PricedProduct, terms: AbroadTerms | null, ctx: PricingContext) {
  const id =
    terms?.consolidationPointId ||
    p.arrivalPointId ||
    p.vendor?.consolidationPointId ||
    ctx.defaultPointId ||
    "";
  return ctx.points.get(id) ?? null;
}

function priceWith(
  ctx: PricingContext,
  wanted: PricedLineInput[],
  destPickupId: string,
): CartPricing {
  const lines: PricedLine[] = [];

  for (const want of wanted) {
    const p = ctx.products.get(want.productId);
    if (!p) continue;

    const isAbroadListing = (ABROAD_TYPES as readonly string[]).includes(p.productType);
    const terms = isAbroadListing ? parseAbroadTerms(p.preorderInfo) : null;
    const origin = effectiveOrigin(p, terms);
    const quantity = Math.max(1, Math.round(want.quantity));
    const point = resolvePoint(p, terms, ctx);
    const forwarder = ctx.forwarders.get(terms?.forwarderId || p.forwarderId || "") ?? null;
    const method: ShippingMethod = isShippingMethod(p.shippingMethod) ? p.shippingMethod : "auto";

    const shipmentLine: ShipmentLine = {
      quantity,
      unitPrice: p.price,
      size: {
        shippingWeightKg: p.shippingWeightKg,
        lengthCm: p.lengthCm,
        widthCm: p.widthCm,
        heightCm: p.heightCm,
        cbm: p.cbm,
      },
      categoryId: p.categoryId,
      method,
      manualFee: p.manualShippingFee,
      originCountry: origin,
      point,
      forwarder,
      supplierDelivers: terms?.supplierDelivers ?? p.supplierDelivers,
      supplierFreight: terms?.supplierFreight ?? p.supplierFreight,
      originTaxRate: terms?.originTaxRate ?? p.originTaxRate,
      taxRate: terms?.ghanaTaxRate ?? (p.ghanaTaxRate ?? -1),
      dutyIncluded: terms?.dutyIncluded ?? false,
    };

    const detail = priceLine(shipmentLine, destPickupId, ctx.shipping);

    lines.push({
      productId: p.id,
      name: p.name,
      quantity,
      unitPrice: p.price,
      goods: round(p.price * quantity),
      shipping: detail.fee,
      abroad: isAbroadListing && isImported(origin) && terms !== null,
      terms,
      point,
      forwarder,
      method,
      categoryId: p.categoryId,
      detail,
      originCountry: origin,
      shippingOnPickup: p.shippingOnPickup,
      collectedAtOrigin: detail.collectedAtOrigin,
      unpricedRoute: detail.unpricedRoute,
    });
  }

  const shipping = sumShipping(
    lines.map((l) => l.detail),
    lines.map((l) => isImported(l.originCountry)),
  );
  const goods = round(lines.reduce((s, l) => s + l.goods, 0));

  // What may be left until collection: the shipping, and only on a cart where
  // every seller allows it. The goods are never deferrable — a seller spends
  // that money the moment they fulfil the order. Requiring *every* line to
  // allow it keeps the choice honest: a part-deferred bill would put a number
  // on the screen that answers no question a buyer was asking.
  const abroadLines = lines.filter((l) => l.abroad);
  const everyLineDefers = lines.length > 0 && lines.every((l) => l.shippingOnPickup);
  const deferrable = everyLineDefers ? round(lines.reduce((s, l) => s + l.shipping, 0)) : 0;

  return {
    lines,
    bill: {
      goods,
      shipping: shipping.fee,
      total: round(goods + shipping.fee),
      deferrable,
      goodsOnlyNow: round(goods + shipping.fee - deferrable),
      components: {
        supplierFreight: shipping.supplierFreight,
        internationalFreight: shipping.internationalFreight,
        localFreight: shipping.localFreight,
        importDuty: shipping.importDuty,
        clearingFee: shipping.clearingFee,
        tax: shipping.tax,
        originTax: shipping.originTax,
      },
    },
    hasAbroad: abroadLines.length > 0,
    payShippingOnPickup: ctx.payOnPickupEnabled && everyLineDefers && deferrable > 0,
    unpricedRoute: lines.some((l) => l.unpricedRoute),
    totalWeightKg: shipping.billableWeightKg,
    totalCbm: shipping.cbm,
    allCollectedAtOrigin: lines.length > 0 && lines.every((l) => l.collectedAtOrigin),
  };
}
