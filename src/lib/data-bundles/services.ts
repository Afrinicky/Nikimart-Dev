import "server-only";
import { dataDb } from "@/lib/data-db";
import {
  mergeServiceFields,
  resolveServiceFields,
  resolveServiceSpeeds,
  servicePricing,
  type ServiceField,
  type ServiceSpeed,
} from "@/lib/data-bundles/service-fields";

/**
 * Reading the services shelf.
 *
 * The second half of the bundle business: paperwork with a fee, a form and a
 * turnaround. Everything here is a read — what is for sale, at whose price,
 * and what has been ordered — and every one of them is wrapped against a
 * database that has not been migrated yet, exactly as the agent reads are. A
 * site whose data database predates this module shows no services rather than
 * an error page.
 *
 * The one rule worth stating: a price is never taken from the page that
 * displayed it. Every sale re-reads the variant and the seller's own row at
 * the moment of purchase, so a storefront left open in a tab cannot sell at
 * yesterday's price.
 */

export interface ServiceVariantRow {
  id: string;
  name: string;
  description: string;
  /** Nickimart's own price. */
  price: number;
  /** What an agent is charged. 0 means it is not resold to agents. */
  agentPrice: number;
  turnaround: string;
  /** Whether the ordinary speed is offered at all. */
  standardEnabled: boolean;
  speeds: ServiceSpeed[];
  fields: ServiceField[];
  isActive: boolean;
  order: number;
}

export interface ServiceRow {
  id: string;
  slug: string;
  name: string;
  tagline: string;
  summary: string;
  imageUrl: string;
  icon: string;
  accentFrom: string;
  accentTo: string;
  fields: ServiceField[];
  terms: string;
  isActive: boolean;
  onStore: boolean;
  order: number;
  variants: ServiceVariantRow[];
}

interface RawVariant {
  id: string;
  name: string;
  description: string;
  price: number;
  agentPrice: number;
  turnaround: string;
  standardEnabled: boolean;
  speeds: string;
  fields: string;
  isActive: boolean;
  order: number;
}

interface RawService {
  id: string;
  slug: string;
  name: string;
  tagline: string;
  summary: string;
  imageUrl: string;
  icon: string;
  accentFrom: string;
  accentTo: string;
  fields: string;
  terms: string;
  isActive: boolean;
  onStore: boolean;
  order: number;
  variants: RawVariant[];
}

function shapeVariant(v: RawVariant): ServiceVariantRow {
  return {
    id: v.id,
    name: v.name,
    description: v.description,
    price: v.price,
    agentPrice: v.agentPrice,
    turnaround: v.turnaround,
    standardEnabled: v.standardEnabled,
    speeds: resolveServiceSpeeds(v.speeds),
    fields: resolveServiceFields(v.fields),
    isActive: v.isActive,
    order: v.order,
  };
}

function shapeService(s: RawService): ServiceRow {
  return {
    id: s.id,
    slug: s.slug,
    name: s.name,
    tagline: s.tagline,
    summary: s.summary,
    imageUrl: s.imageUrl,
    icon: s.icon,
    accentFrom: s.accentFrom,
    accentTo: s.accentTo,
    fields: resolveServiceFields(s.fields),
    terms: s.terms,
    isActive: s.isActive,
    onStore: s.onStore,
    order: s.order,
    variants: s.variants.map(shapeVariant),
  };
}

/** Variants in the order the admin arranged them, oldest first on a tie. */
const VARIANT_ORDER = [{ order: "asc" as const }, { createdAt: "asc" as const }];
const WITH_VARIANTS = { variants: { orderBy: VARIANT_ORDER } };
const BY_ORDER = [{ order: "asc" as const }, { createdAt: "asc" as const }];

/** Every service, active or not — the admin's catalogue. */
export async function getAllServices(): Promise<ServiceRow[]> {
  try {
    const rows = await dataDb.dataService.findMany({
      include: WITH_VARIANTS,
      orderBy: BY_ORDER,
    });
    return rows.map(shapeService);
  } catch {
    return [];
  }
}

/** One service by its id, with every variant. For the admin's editor. */
export async function getServiceById(id: string): Promise<ServiceRow | null> {
  try {
    const row = await dataDb.dataService.findUnique({ where: { id }, include: WITH_VARIANTS });
    return row ? shapeService(row) : null;
  } catch {
    return null;
  }
}

/** Live services with at least one sellable variant — the public shelf. */
export async function getLiveServices(): Promise<ServiceRow[]> {
  try {
    const rows = await dataDb.dataService.findMany({
      where: { isActive: true },
      include: {
        variants: {
          where: { isActive: true, price: { gt: 0 } },
          orderBy: VARIANT_ORDER,
        },
      },
      orderBy: BY_ORDER,
    });
    return rows.map(shapeService).filter((s) => s.variants.length > 0);
  } catch {
    return [];
  }
}

/** One live service by slug, for the public order form. */
export async function getLiveServiceBySlug(slug: string): Promise<ServiceRow | null> {
  try {
    const row = await dataDb.dataService.findUnique({
      where: { slug: slug.toLowerCase() },
      include: {
        variants: {
          where: { isActive: true, price: { gt: 0 } },
          orderBy: VARIANT_ORDER,
        },
      },
    });
    if (!row) return null;
    const service = shapeService(row);
    return service.isActive && service.variants.length > 0 ? service : null;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// What one seller sells, at their price
// ---------------------------------------------------------------------------

/** One variant as a seller offers it. */
export interface SellableVariant extends ServiceVariantRow {
  /** What this seller charges, before any speed fee. */
  sellPrice: number;
  /** Their cost basis for it. Equal to sellPrice on Nickimart's own store. */
  costPrice: number;
  /** sellPrice − costPrice. Zero on Nickimart's own store. */
  commission: number;
}

export interface SellableService extends Omit<ServiceRow, "variants"> {
  variants: SellableVariant[];
  /** The cheapest a customer can have it done for. */
  fromPrice: number;
}

function priced(service: ServiceRow, variants: SellableVariant[]): SellableService {
  const { variants: _drop, ...rest } = service;
  void _drop;
  return {
    ...rest,
    variants,
    fromPrice: variants.reduce((min, v) => (min === 0 ? v.sellPrice : Math.min(min, v.sellPrice)), 0),
  };
}

/** The shelf on Nickimart's own storefront: its own prices, no commission. */
export async function getHouseShelf(): Promise<SellableService[]> {
  const services = await getLiveServices();
  return services
    .filter((s) => s.onStore)
    .map((s) =>
      priced(
        s,
        s.variants.map((v) => ({ ...v, sellPrice: v.price, costPrice: v.price, commission: 0 })),
      ),
    );
}

/**
 * Every live service at Nickimart's own prices, whether or not it is shown on
 * the store. The counter sells what the business does, not what the website
 * happens to advertise — a service kept off the storefront while it is being
 * tried out is still one an admin can register somebody for.
 */
export async function getHouseCatalogue(): Promise<SellableService[]> {
  const services = await getLiveServices();
  return services.map((s) =>
    priced(
      s,
      s.variants.map((v) => ({ ...v, sellPrice: v.price, costPrice: v.price, commission: 0 })),
    ),
  );
}

/** One service on Nickimart's own storefront. */
export async function getHouseService(slug: string): Promise<SellableService | null> {
  const service = await getLiveServiceBySlug(slug);
  if (!service || !service.onStore) return null;
  return priced(
    service,
    service.variants.map((v) => ({ ...v, sellPrice: v.price, costPrice: v.price, commission: 0 })),
  );
}

async function agentOverrides(agentId: string): Promise<Map<string, number>> {
  try {
    const rows = await dataDb.dataAgentServicePrice.findMany({ where: { agentId } });
    return new Map(rows.map((r) => [r.variantId, r.price]));
  } catch {
    return new Map();
  }
}

async function agentShelfChoices(agentId: string): Promise<Map<string, boolean>> {
  try {
    const rows = await dataDb.dataAgentService.findMany({ where: { agentId } });
    return new Map(rows.map((r) => [r.serviceId, r.visible]));
  } catch {
    return new Map();
  }
}

/**
 * What an agent may sell, at their prices.
 *
 * A variant with no agent price is not resold and never appears — the same
 * rule a bundle follows. An agent who has set no price of their own sells at
 * Nickimart's retail price, which is the honest default: they earn the
 * standard margin without having had to decide anything.
 */
function agentVariants(
  service: ServiceRow,
  overrides: Map<string, number>,
): SellableVariant[] {
  return service.variants
    .filter((v) => v.agentPrice > 0)
    .map((v) => {
      const sellPrice = overrides.get(v.id) ?? v.price;
      const { commission } = servicePricing({
        sellPrice,
        costPrice: v.agentPrice,
        speedFee: 0,
      });
      return { ...v, sellPrice, costPrice: v.agentPrice, commission };
    });
}

/** Every service an agent *could* list, whether or not they show it. */
export async function getAgentServiceRows(
  agentId: string,
): Promise<Array<SellableService & { visible: boolean }>> {
  const [services, overrides, choices] = await Promise.all([
    getLiveServices(),
    agentOverrides(agentId),
    agentShelfChoices(agentId),
  ]);

  return services
    .map((s) => {
      const variants = agentVariants(s, overrides);
      return { ...priced(s, variants), visible: choices.get(s.id) ?? true };
    })
    .filter((s) => s.variants.length > 0);
}

/** The shelf an agent's storefront actually shows. */
export async function getAgentShelf(agentId: string): Promise<SellableService[]> {
  const rows = await getAgentServiceRows(agentId);
  return rows.filter((s) => s.visible);
}

/** One service on an agent's storefront, at their price. */
export async function getAgentService(
  agentId: string,
  slug: string,
): Promise<SellableService | null> {
  const shelf = await getAgentShelf(agentId);
  return shelf.find((s) => s.slug === slug.toLowerCase()) ?? null;
}

/**
 * Re-read one variant at purchase time.
 *
 * The browser posts a variant id and a speed key, nothing else, so a
 * storefront left open in a tab can never sell at yesterday's price or at a
 * price it was handed. `agentId` of null prices it as Nickimart's own.
 */
export async function findSellableVariant(
  serviceSlug: string,
  variantId: string,
  agentId: string | null,
  /**
   * Include a service kept off Nickimart's own storefront. Only the counter
   * passes this: an admin registering somebody in person is selling what the
   * business does, not what the website advertises.
   */
  includeOffStore = false,
): Promise<{ service: SellableService; variant: SellableVariant } | null> {
  const house = includeOffStore
    ? (await getHouseCatalogue()).find((s) => s.slug === serviceSlug.toLowerCase()) ?? null
    : await getHouseService(serviceSlug);
  const service = agentId ? await getAgentService(agentId, serviceSlug) : house;
  if (!service) return null;
  const variant = service.variants.find((v) => v.id === variantId);
  if (!variant || !variant.isActive || variant.sellPrice <= 0) return null;
  return { service, variant };
}

/** The whole form for one variant: the service's questions, then its own. */
export function formFor(service: { fields: ServiceField[] }, variant: { fields: ServiceField[] }) {
  return mergeServiceFields(service.fields, variant.fields);
}

/** The terms, one per line, with the blanks dropped. */
export function termsLines(terms: string): string[] {
  return terms
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line !== "");
}
