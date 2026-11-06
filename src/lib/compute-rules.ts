/**
 * How the performance switches are read, as arithmetic.
 *
 * Separated from compute-settings.ts, which is the thing that reaches the
 * database, so that the decisions here can be tested on their own — the same
 * split as affiliate-policy / affiliate-rules and the rest. No imports, no
 * aliases, no "server-only": it has to load under Node's type stripping.
 *
 * Two rules are worth stating out loud, because both are the opposite of what
 * a careless reading would do:
 *
 *   A value that cannot be understood falls back to the *working* behaviour,
 *   never to off. These settings are stored as free text in a key/value table;
 *   a typo, a half-finished migration or a hand-run UPDATE must not be what
 *   takes the storefront's link previews away.
 *
 *   Low compute mode overrides without overwriting. The admin's own choices
 *   stay in the database untouched, so turning the panic switch off restores
 *   them exactly rather than leaving the site stripped and somebody trying to
 *   remember what it looked like before.
 */

export type CrawlerPolicy = "open" | "lean" | "closed";

export interface ComputeSettings {
  /** True when the panic switch is on and everything below is forced cheap. */
  lowComputeMode: boolean;
  /** Render link-preview cards at all. */
  ogImages: boolean;
  /** Use the product's own photograph in its card (decode + re-encode). */
  ogProductPhoto: boolean;
  /** Let an orders screen refresh itself while somebody watches it. */
  liveOrderRefresh: boolean;
  /** Seconds before the first refresh; it doubles from there. */
  liveOrderRefreshSeconds: number;
  /** The storefront chat bubble. */
  liveChat: boolean;
  /** Answer one-word registration links at the root. */
  inviteShortLinks: boolean;
  /** How much of the site crawlers are invited into. */
  crawlerPolicy: CrawlerPolicy;
  /** Publish a sitemap. */
  sitemap: boolean;
  /** The most products to list in it. */
  sitemapProductLimit: number;
  /** How many cards one catalogue view renders. */
  cataloguePageLimit: number;
  /** The nightly exchange-rate pull. */
  fxAutoRefresh: boolean;
  /** The nightly bundle sweep. */
  dataBundleSweep: boolean;
}

/** The raw strings this reads, as stored. Every one may be missing. */
export type ComputeSettingValues = Partial<Record<
  | "lowComputeMode"
  | "ogImagesEnabled"
  | "ogProductPhotoEnabled"
  | "liveOrderRefreshEnabled"
  | "liveOrderRefreshSeconds"
  | "liveChatEnabled"
  | "inviteShortLinksEnabled"
  | "crawlerPolicy"
  | "sitemapEnabled"
  | "sitemapProductLimit"
  | "cataloguePageLimit"
  | "fxAutoRefreshEnabled"
  | "dataBundleSweepEnabled",
  string
>>;

/** A stored "1"/"0". Anything unrecognised is the working answer, not off. */
export function readFlag(value: string | undefined, fallback = true): boolean {
  const v = (value ?? "").trim();
  if (v === "0") return false;
  if (v === "1") return true;
  return fallback;
}

/**
 * A stored number, clamped. A blank or malformed value is the default.
 *
 * The emptiness check has to come first and cannot be folded into the
 * `isFinite` below it, because `Number("")` is **0**, not NaN. Without it a
 * key that has never been written — or one an admin cleared — reads as zero
 * and is then clamped up to the floor: a blank "products per page" would
 * quietly become twelve rather than ninety-six, and a blank sitemap limit
 * would read as the deliberate "list no products" choice. The bundle console
 * learned this one the same way (see backup-schedule.ts).
 */
export function readCount(
  value: string | undefined,
  fallback: number,
  min: number,
  max: number,
): number {
  const raw = (value ?? "").trim();
  if (raw === "") return fallback;
  const n = Number(raw);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, Math.round(n)));
}

export function readCrawlerPolicy(value: string | undefined): CrawlerPolicy {
  const v = (value ?? "").trim().toLowerCase();
  return v === "open" || v === "closed" ? v : "lean";
}

/** The site at full strength. Also what a failed settings read falls back to. */
export const COMPUTE_DEFAULTS: ComputeSettings = {
  lowComputeMode: false,
  ogImages: true,
  ogProductPhoto: true,
  liveOrderRefresh: true,
  liveOrderRefreshSeconds: 20,
  liveChat: true,
  inviteShortLinks: true,
  crawlerPolicy: "lean",
  sitemap: true,
  sitemapProductLimit: 5000,
  cataloguePageLimit: 96,
  fxAutoRefresh: true,
  dataBundleSweep: true,
};

/**
 * The cheapest the site is willing to be.
 *
 * Note what this does *not* do: it does not take the shop offline, close the
 * catalogue, or stop anybody buying anything. It turns off the work done on
 * behalf of scrapers and idle tabs, and narrows the pages a crawler may walk.
 * A shopper who arrives, searches and checks out sees a site that behaves as
 * it did — minus the chat bubble, and with a plainer card when they share a
 * link.
 *
 * Two switches are deliberately absent. `inviteShortLinks`, because an advert
 * already printed with a short path on it must not stop working because the
 * hosting bill got tight. `fxAutoRefresh`, because a stale cedi rate is wrong
 * in one direction only and costs more in mispriced orders than the call saves.
 */
export const LOW_COMPUTE: Partial<ComputeSettings> = {
  ogImages: false,
  ogProductPhoto: false,
  liveOrderRefresh: false,
  liveChat: false,
  crawlerPolicy: "closed",
  sitemap: false,
  cataloguePageLimit: 48,
  dataBundleSweep: false,
};

/** Stored strings in, resolved settings out. */
export function resolveComputeSettings(values: ComputeSettingValues): ComputeSettings {
  const chosen: ComputeSettings = {
    lowComputeMode: readFlag(values.lowComputeMode, false),
    ogImages: readFlag(values.ogImagesEnabled),
    ogProductPhoto: readFlag(values.ogProductPhotoEnabled),
    liveOrderRefresh: readFlag(values.liveOrderRefreshEnabled),
    liveOrderRefreshSeconds: readCount(values.liveOrderRefreshSeconds, 20, 10, 600),
    liveChat: readFlag(values.liveChatEnabled),
    inviteShortLinks: readFlag(values.inviteShortLinksEnabled),
    crawlerPolicy: readCrawlerPolicy(values.crawlerPolicy),
    sitemap: readFlag(values.sitemapEnabled),
    sitemapProductLimit: readCount(values.sitemapProductLimit, 5000, 0, 50_000),
    cataloguePageLimit: readCount(values.cataloguePageLimit, 96, 12, 500),
    fxAutoRefresh: readFlag(values.fxAutoRefreshEnabled),
    dataBundleSweep: readFlag(values.dataBundleSweepEnabled),
  };

  return chosen.lowComputeMode ? { ...chosen, ...LOW_COMPUTE } : chosen;
}
