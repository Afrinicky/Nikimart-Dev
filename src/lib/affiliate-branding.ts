import "server-only";
import { cache } from "react";
import { getSettings } from "@/lib/settings";
import { siteUrl } from "@/lib/site";
import {
  DEFAULT_FLYER_DESIGN,
  resolveFlyerDesign,
  type FlyerDesign,
} from "@/lib/affiliate-flyer";
import {
  DEFAULT_WATERMARK,
  resolveWatermark,
  type WatermarkConfig,
} from "@/lib/affiliate-watermark";

/**
 * How a share looks, resolved once for whoever is about to make one.
 *
 * Two layers and no more. The admin sets the house flyer design and the
 * watermark; an affiliate may layer their own flyer design on top of the house
 * one, part by part, so an admin changing the house style still reaches every
 * part they have not personally overridden.
 *
 * The watermark is deliberately not one of the layers. It is the mark that
 * says where a photograph came from, and a mark each affiliate could rewrite
 * would not be one.
 */

export interface AffiliateBranding {
  /** The house design, as the admin set it. */
  house: FlyerDesign;
  /** What this affiliate's flyers actually use. */
  design: FlyerDesign;
  /** True when they have a design of their own rather than the house one. */
  custom: boolean;
  watermark: WatermarkConfig;
  /**
   * The brand mark the watermark may carry, as a URL the browser can load
   * without tripping CORS. Empty when the platform has no logo set.
   */
  logoUrl: string;
}

/** The house style: the admin's flyer design and the watermark. */
export const getHouseBranding = cache(
  async (): Promise<Omit<AffiliateBranding, "design" | "custom">> => {
    const settings = await getSettings();
    return {
      house: resolveFlyerDesign(settings.affiliateFlyerDesign, DEFAULT_FLYER_DESIGN),
      watermark: resolveWatermark(settings.affiliateWatermark, DEFAULT_WATERMARK),
      logoUrl: logoFrom(settings.logoUrl),
    };
  },
);

/** The house style with one affiliate's own design layered over it. */
export async function getAffiliateBranding(
  affiliate: { flyerDesign?: string | null; flyerTheme?: string | null } | null,
): Promise<AffiliateBranding> {
  const base = await getHouseBranding();
  const stored = (affiliate?.flyerDesign ?? "").trim();
  const design = resolveFlyerDesign(stored, base.house);

  // The colourway an affiliate picked in the share studio is remembered
  // separately from the design, and it is the more recent of the two choices —
  // so it wins over the design's own theme.
  const theme = (affiliate?.flyerTheme ?? "").trim();
  return {
    ...base,
    design: theme ? { ...design, theme } : design,
    custom: stored !== "",
  };
}

/**
 * The logo as something a canvas can draw from.
 *
 * A stored data: URL is served from `/brand/logo`, which is same-origin and so
 * never taints the canvas. An http(s) logo on somebody else's host might, and
 * a tainted canvas cannot be exported at all — so the drawing falls back to
 * leaving the logo off rather than producing a flyer nobody can save. Made
 * absolute because the share studio hands it straight to an Image.
 */
function logoFrom(value: string | undefined): string {
  const raw = (value ?? "").trim();
  if (!raw) return "";
  if (raw.startsWith("/")) return `${siteUrl()}${raw}`;
  return raw;
}

export type { FlyerDesign, WatermarkConfig };

// ---------------------------------------------------------------------------
// The preview's product
// ---------------------------------------------------------------------------

/**
 * A real product to design against.
 *
 * A designer previewing against made-up data is a designer who finds out about
 * long product names and missing photographs after the first share. So the
 * preview uses an actual listing — one with a picture and a discount where the
 * catalogue has one, since those are the parts of the layout most likely to
 * collide — and falls back to a plausible stand-in on an empty catalogue.
 */
export async function getSampleProduct(): Promise<{
  data: {
    name: string;
    price: string;
    oldPrice: string | null;
    discount: string | null;
    shopName: string;
    categoryName: string;
    link: string;
    sharedBy: string;
    emoji: string;
    gradientFrom: string;
    gradientTo: string;
    message: string;
  };
  imageUrl: string | null;
}> {
  const { prisma } = await import("@/lib/prisma");
  const { formatPrice, discountPercent } = await import("@/lib/format");

  const product = await prisma.product
    .findFirst({
      where: { isArchived: false, vendor: { verificationStatus: "verified" } },
      orderBy: [{ affiliateEnabled: "desc" }, { isFeatured: "desc" }, { name: "asc" }],
      select: {
        name: true,
        price: true,
        oldPrice: true,
        image: true,
        emoji: true,
        gradientFrom: true,
        gradientTo: true,
        category: { select: { name: true } },
        vendor: { select: { businessName: true } },
        images: { orderBy: { order: "asc" }, take: 1, select: { url: true } },
      },
    })
    .catch(() => null);

  const settings = await getSettings();
  const message =
    settings.affiliateShareMessage ||
    "Grab this on Nickimart — genuine goods, nationwide delivery.";
  const link = `${siteUrl().replace(/^https?:\/\//, "")}/r/ABC123`;

  if (!product) {
    return {
      imageUrl: null,
      data: {
        name: "Badefu 8 in 1 Electric Blender",
        price: formatPrice(250),
        oldPrice: formatPrice(400),
        discount: "-38%",
        shopName: "Nickimart Official Store",
        categoryName: "Home Appliances",
        link,
        sharedBy: "Ama K.",
        emoji: "🛍️",
        gradientFrom: "#f1f5f9",
        gradientTo: "#cbd5e1",
        message,
      },
    };
  }

  const off = discountPercent(product.price, product.oldPrice ?? undefined);
  return {
    imageUrl: product.images[0]?.url ?? product.image ?? null,
    data: {
      name: product.name,
      price: formatPrice(product.price),
      oldPrice: product.oldPrice ? formatPrice(product.oldPrice) : null,
      discount: off ? `-${off}%` : null,
      shopName: product.vendor?.businessName ?? "Nickimart",
      categoryName: product.category?.name ?? "Nickimart",
      link,
      sharedBy: "Ama K.",
      emoji: product.emoji,
      gradientFrom: product.gradientFrom,
      gradientTo: product.gradientTo,
      message,
    },
  };
}
