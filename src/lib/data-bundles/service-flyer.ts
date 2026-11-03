import "server-only";
import { cache } from "react";
import { siteUrl } from "@/lib/site";
import { getDataSettings } from "@/lib/data-bundles/settings";
import {
  DEFAULT_FLYER_DESIGN,
  resolveFlyerDesign,
  type FlyerDesign,
  type ProductFlyerData,
} from "@/lib/affiliate-flyer";
import type { SellableService } from "@/lib/data-bundles/services";

/**
 * The flyer an agent shares for a service.
 *
 * Deliberately the affiliate flyer, not a second one. That drawing is already
 * a designed layout with a frame for a photograph, a headline, a price pill
 * and a footer carrying a link — which is exactly what a passport or business
 * registration flyer needs — and it already has an editor an admin knows how
 * to use. Building a parallel one would have meant two designers to keep in
 * step and two sets of bugs; what a service needed instead was a picture, and
 * the admin uploads that with the listing.
 *
 * Two layers, the same as the affiliate's: the admin sets the house design
 * every agent starts from, and an agent may lay their own over it part by
 * part, so an admin changing the house style still reaches everything they
 * have not personally overridden.
 */

export interface ServiceBranding {
  /** The house design, as the admin set it. */
  house: FlyerDesign;
  /** What this agent's flyers actually use. */
  design: FlyerDesign;
  /** True when they have a design of their own rather than the house one. */
  custom: boolean;
}

/** The house style: the admin's design, or the built-in one. */
export const getHouseServiceBranding = cache(async (): Promise<FlyerDesign> => {
  const settings = await getDataSettings();
  return resolveFlyerDesign(settings.dataServiceFlyerDesign, SERVICE_FLYER_DEFAULT);
});

/**
 * The built-in design, which is the affiliate flyer's with one change: the
 * badge says what the business is called here. Everything else is the same
 * layout, and that is the point — an agent who has shared a product flyer has
 * already shared one of these.
 */
export const SERVICE_FLYER_DEFAULT: FlyerDesign = {
  ...DEFAULT_FLYER_DESIGN,
  badge: { ...DEFAULT_FLYER_DESIGN.badge, label: "NICKIMART" },
};

/** The house style with one agent's own design layered over it. */
export async function getAgentServiceBranding(
  agent: { serviceFlyerDesign?: string | null; serviceFlyerTheme?: string | null } | null,
): Promise<ServiceBranding> {
  const house = await getHouseServiceBranding();
  const stored = (agent?.serviceFlyerDesign ?? "").trim();
  const design = resolveFlyerDesign(stored, house);

  // The colourway picked in the share studio is the more recent of the two
  // choices, so it wins over whatever the design itself says.
  const theme = (agent?.serviceFlyerTheme ?? "").trim();
  return {
    house,
    design: theme ? { ...design, theme } : design,
    custom: stored !== "",
  };
}

/**
 * One service as the flyer draws it.
 *
 * The mapping is the whole adaptation: a service is a product with a price
 * from, a category line that says how long it takes, and a shop that is
 * whoever is sharing it.
 */
export function serviceFlyerData(input: {
  service: Pick<SellableService, "name" | "tagline" | "icon" | "accentFrom" | "accentTo" | "fromPrice" | "variants">;
  storeName: string;
  /** nickimart.com/store/joycy, or nickimart.com/data-bundles. */
  link: string;
  sharedBy: string;
  message: string;
}): ProductFlyerData {
  const { service } = input;
  const cheapest = service.variants.reduce(
    (min, v) => (min === 0 ? v.sellPrice : Math.min(min, v.sellPrice)),
    0,
  );
  const price = cheapest || service.fromPrice;
  // More than one option means the price is a starting point, and saying so on
  // the flyer is the difference between a quote and a complaint.
  const label = service.variants.length > 1 ? `From GH₵${price.toFixed(2)}` : `GH₵${price.toFixed(2)}`;

  return {
    name: service.name,
    price: label,
    oldPrice: null,
    discount: null,
    shopName: input.storeName,
    categoryName: service.tagline || "Registrations & services",
    message: input.message,
    link: input.link,
    sharedBy: input.sharedBy,
    emoji: service.icon || "📄",
    gradientFrom: service.accentFrom,
    gradientTo: service.accentTo,
  };
}

/** The caption that goes to WhatsApp beside the picture. */
export function serviceShareText(input: {
  serviceName: string;
  price: string;
  storeName: string;
  link: string;
  message: string;
}): string {
  const lines = [
    input.message.trim() || `${input.serviceName} — ${input.price}`,
    "",
    `Apply online: ${input.link}`,
  ];
  return lines.join("\n");
}

/** A sensible first caption for a service nobody has written one for. */
export function defaultServiceMessage(serviceName: string, turnaround: string): string {
  const speed = turnaround ? ` Ready in ${turnaround}.` : "";
  return `Need ${serviceName.toLowerCase()}? We handle the whole process for you.${speed}`;
}

/**
 * The public link a share points at.
 *
 * An agent's is their own storefront's copy of the page, which is what makes
 * it a referral link: the application that comes off it is priced from their
 * ladder and credited to them, with nothing to track and no code to quote.
 */
export function serviceLink(slug: string, storeSlug?: string | null): string {
  const base = siteUrl().replace(/^https?:\/\//, "");
  return storeSlug
    ? `${base}/store/${storeSlug}/services/${slug}`
    : `${base}/data-bundles/services/${slug}`;
}
