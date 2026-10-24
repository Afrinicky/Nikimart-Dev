import "server-only";
import { medicalDb, readMedical } from "@/lib/medical/db";

/**
 * Homepage content an administrator controls.
 *
 * The hero, the promotional bands and which rails appear are rows, not JSX.
 * The brief asks for the homepage to be data-driven, and the practical test of
 * that is whether the business can change what the first screen says without
 * a deploy — which, for a supplier whose stock position moves weekly, it has
 * to be able to do.
 *
 * Code still owns the *shape* of each block. A homepage where the layout is
 * also data is a page builder, and a page builder is how a careful design
 * becomes a different careful design every time somebody drags something.
 */

export type HomepageBlockKind =
  | "HERO"
  | "BANNER"
  | "PRODUCT_RAIL"
  | "CATEGORY_GRID"
  | "PROMO"
  | "SUPPORT"
  | "RICH_TEXT";

export interface HomepageBlock {
  id: string;
  kind: HomepageBlockKind;
  position: number;
  title: string;
  subtitle: string;
  body: string;
  image: string;
  imageAlt: string;
  ctaLabel: string;
  ctaHref: string;
  secondaryCtaLabel: string;
  secondaryCtaHref: string;
  /** For a rail: FEATURED | NEW | POPULAR | CATEGORY. */
  source: string;
  config: Record<string, unknown>;
}

export async function getHomepageBlocks(): Promise<HomepageBlock[]> {
  const now = new Date();

  return readMedical(async () => {
    const rows = await medicalDb.homepageBlock.findMany({
      where: {
        isActive: true,
        // A promotion with a window is only live inside it. Filtered in the
        // query rather than after, so a scheduled band cannot flash on a
        // cached page before the filter runs.
        AND: [
          { OR: [{ startsAt: null }, { startsAt: { lte: now } }] },
          { OR: [{ endsAt: null }, { endsAt: { gte: now } }] },
        ],
      },
      orderBy: { position: "asc" },
    });

    return rows.map((row) => ({
      id: row.id,
      kind: row.kind as HomepageBlockKind,
      position: row.position,
      title: row.title,
      subtitle: row.subtitle,
      body: row.body,
      image: row.image,
      imageAlt: row.imageAlt,
      ctaLabel: row.ctaLabel,
      ctaHref: row.ctaHref,
      secondaryCtaLabel: row.secondaryCtaLabel,
      secondaryCtaHref: row.secondaryCtaHref,
      source: row.source,
      config: parseConfig(row.config),
    }));
  }, []);
}

/** The first block of a kind, or null. The hero is a singleton in practice. */
export function blockOfKind(
  blocks: HomepageBlock[],
  kind: HomepageBlockKind,
): HomepageBlock | null {
  return blocks.find((block) => block.kind === kind) ?? null;
}

function parseConfig(raw: string): Record<string, unknown> {
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw);
    return typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : {};
  } catch {
    // Administrator-entered JSON. A malformed value means the block renders
    // with its defaults, not that the homepage fails to render.
    return {};
  }
}
