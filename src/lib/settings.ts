import "server-only";
import { cache } from "react";
import { unstable_cache } from "next/cache";
import { prisma } from "@/lib/prisma";
import { normaliseDataBundlesUrl } from "@/lib/data-bundles/store-link";

// Site-wide settings stored as key/value rows, merged with these defaults.
export const SETTINGS_DEFAULTS = {
  supportEmail: "support@nickimart.gh",
  supportPhone: "030 000 0000",
  businessHours: "Mon–Sat, 8am–7pm",
  liveChatStatus: "Coming soon",
  footerTagline: "Shop smart. Sell faster. Deliver closer.",
  footerNote: "Buy local. Ship from abroad. Shop Nickimart.",
  restrictionsText:
    "Nickimart restricts dangerous, illegal, and age-restricted products including weapons, alcohol, nicotine, drugs, gambling, adult content, counterfeit goods, and prescription medicine.",
  copyrightName: "Nickimart",
  // The note under the public pickup-points list. Empty hides it.
  pickupPointsNote:
    "More pickup points are being added across Ghana. Home delivery is also available in many areas at checkout.",
  // The public "How it works" page. The steps are a JSON array of
  // { title, body }; an empty or unparseable value falls back to the built-in
  // set (see lib/how-it-works), so the page can never render blank.
  howItWorksIntro: "Shop the world and pick up in Ghana — here's the journey from cart to collection.",
  howItWorksSteps: "",
  // Brand logo (http(s) URL or a data: URL). Empty → the built-in mark.
  logoUrl: "",
  // Where "Buy Data Bundles" points. Defaults to Nickimart's own bundle
  // storefront; set an external URL to hand the traffic elsewhere, or empty to
  // hide the shortcuts entirely.
  dataBundlesUrl: "/data-bundles",
  // --- Data bundle storefront ----------------------------------------------
  // Master switch. "0" takes the storefront offline (browsing and buying) while
  // leaving the admin console reachable.
  dataBundlesEnabled: "1",
  // Storefront branding, shown on /data-bundles.
  dataStoreName: "Nickimart Data",
  dataStoreTagline: "MTN, Telecel & AirtelTigo bundles — delivered in seconds.",
  // Support contact for bundle buyers. Empty hides the button.
  dataSupportWhatsapp: "",
  // AFA (agent SIM) registration: whether it's sold, and for how much (GH₵).
  dataAfaEnabled: "1",
  dataAfaPrice: "12",
  // Default markup (percent over upstream cost) the admin price tool suggests.
  dataMarkupPercent: "25",
  // Warn admins when the agent wallet falls below this (GH₵). An empty wallet
  // fails every order *after* the customer has paid, so the alarm has to come
  // while there's still time to top up.
  dataLowBalanceThreshold: "50",
  // --- Agent programme ------------------------------------------------------
  // Master switch for recruiting agents. "0" hides the pitch page and closes
  // signup; existing agents keep trading.
  agentProgramEnabled: "1",
  // What it costs an agent to open a storefront (GH₵). Charged as a debit the
  // moment the store is created, so the account opens on a negative balance
  // that clears itself out of their commissions.
  agentSetupFee: "30",
  // Flat fee (GH₵) added to every commission withdrawal, and the smallest
  // amount an agent may withdraw.
  agentWithdrawalFee: "1",
  agentMinWithdrawal: "10",
  // Default discount (percent off the public retail price) suggested when the
  // admin sets the agent price on a bundle.
  agentAgentMarkupPercent: "12",
  // Support contacts shown on the agent Support screen. Empty falls back to
  // the site-wide support details.
  agentSupportPhone: "",
  agentSupportWhatsapp: "",
  agentWhatsappGroup: "",
  // The headline on the public recruitment page.
  agentPitch:
    "Resell MTN, Telecel and AirtelTigo bundles under your own store name. You set the prices, we deliver the data.",
  // Platform commission (percent) taken on every sale. Sellers register free
  // and Nickimart earns this cut per item; overridable per category.
  commissionRate: "10",
  // Default affiliate commission (percent of the item price) used when neither
  // the product nor its category sets its own rate.
  affiliateRate: "5",
  // The highest rate any product currently advertises — drives the public
  // "earn up to X%" headline. Recomputed suggestions aside, admins set it here.
  affiliateMaxRate: "10",
  // The public affiliate headline. "{rate}" is replaced with affiliateMaxRate.
  affiliatePitch: "You can earn up to {rate}% on each product you refer.",
  // How staff (sellers, freight, pickup, admins) are alerted about orders and
  // jobs: "sms" | "email" | "both". Buyers are always alerted on both channels.
  staffNotifyChannel: "both",
  // Nickimart's own social media handles (full URLs). Empty = hidden.
  socialFacebook: "",
  socialInstagram: "",
  socialTwitter: "",
  socialTiktok: "",
  socialYoutube: "",
  socialWhatsapp: "",
  // --- Shipping: the domestic leg -------------------------------------------
  // Goods gather at a consolidation point, are checked, and are couriered to
  // the buyer's pickup station. One seller's goods are one consignment, and it
  // is priced the way a courier prices one: a base fee for the load, then a
  // small increment for every unit after the first. Ten bottles from one shop
  // are one van and one handover, not ten of each. Per-route and per-category
  // overrides live in the shipping rules table (Admin → Shipping → Inside
  // Ghana); these are the fallbacks.
  shipBaseFee: "10",
  shipPerUnitFee: "1.5",
  // Legacy: GH₵ per billable kilogram. Only used to derive an increment for a
  // rule written before the base+increment model and never updated since.
  shipPerKgRate: "0",
  // cm³ per volumetric kilogram (courier standard ≈ 5000).
  shipVolumetricDivisor: "5000",
  // No charged domestic leg is billed under this. Collection at the point the
  // goods already sit at stays free regardless — it is not a charged leg.
  shipMinFee: "0",
  // The consolidation point a listing with none of its own falls back to.
  shipDefaultPointId: "",
  // --- Shipping: large items ------------------------------------------------
  // Some goods a flat base fee prices wrongly: a fridge, a chest freezer, a
  // double oven. What they cost to move is the space they take. These say when
  // an item is one of those, and what a cubic metre of it costs when the lane
  // in the base-fee grid has not said. A threshold of "0" is not a test at all,
  // so an admin can flag by size alone, by weight alone, or by any of them.
  shipLargeEnabled: "1",
  // The longest side, in cm.
  shipLargeMinLongestCm: "120",
  // The volume, in cubic metres.
  shipLargeMinCbm: "0.5",
  // What it actually weighs, in kg. Volumetric weight is not consulted here —
  // that is what the volume threshold above is for.
  shipLargeMinWeightKg: "50",
  // GH₵ per cubic metre for a large item, when its lane has not priced one.
  // Zero means large goods fall back to the ordinary flat base fee, which is
  // what a platform that has not set this up yet should do — never free.
  shipLargeRatePerCbm: "0",
  // No large item is billed under this, once it is billed by size at all.
  shipLargeMinFee: "0",
  // A second large item in the same consignment is an increment, not a second
  // base fee — and its increment is a share of its own size-based price, so a
  // second fridge costs more to add than a second microwave. 100 would charge
  // it in full; 0 would carry it free.
  shipLargeExtraPercent: "60",
  // --- Shipping: from abroad ------------------------------------------------
  // Nothing platform-wide prices the leg from abroad any more. A forwarder's
  // own grid does, in their own currency, and their lanes carry their own
  // delivery estimates — so a default here could only contradict one of them.
  // Whether a buyer may settle the shipping when they collect instead of at
  // checkout. The goods are always paid for in full at checkout. "0" turns the
  // option off everywhere; a listing can still decline it on its own.
  shipPayOnPickupEnabled: "1",
  // The public heading and blurb on /shipped-from-abroad.
  abroadPageTitle: "Shipped from Abroad",
  abroadPageIntro:
    "Sellers source these from suppliers in China, Dubai, the USA and Europe. You order here, we freight it in, and you collect it at your pickup point. Ordering stays open — nothing closes.",
} as const;

export type SettingKey = keyof typeof SETTINGS_DEFAULTS;
export type Settings = Record<SettingKey, string>;

export const SETTING_KEYS = Object.keys(SETTINGS_DEFAULTS) as SettingKey[];

/**
 * Cache tag for the stored settings. Anything that writes a SiteSetting row
 * must revalidate it, or the edit won't show until the window below lapses.
 */
export const SETTINGS_TAG = "site-settings";

/**
 * The stored rows, cached across requests.
 *
 * `cache()` from React only dedupes within a single render, and the chrome —
 * Header, Footer and TopBar — reads settings on every page the site serves. So
 * the whole table was being read once per page view. That is cheap in rows and
 * ruinous in bytes: `logoUrl` may hold a `data:` URL, which makes these ~54
 * rows close to a megabyte, and every page view was re-downloading the brand
 * mark from Postgres. Measured over one billing period it came to gigabytes of
 * database egress — the single largest consumer of the network transfer quota.
 *
 * Keyed reads also matter: filtering on the primary key lets Postgres use the
 * index instead of scanning the table, and skips any stray rows written by an
 * older build that `SETTING_KEYS` would only discard anyway.
 *
 * The image keys are excluded from the bulk read entirely — see below.
 */

/**
 * Settings whose value may hold a whole image rather than a line of text.
 *
 * The admin image fields accept a `data:` URL, so what looks like a URL can be
 * an entire PNG in base64. One 1200x1200 logo measured 413 KB as text. Read on
 * every page, that is the difference between a settings table you can ignore
 * and one that costs gigabytes a month, so these keys never travel with the
 * rest: the bulk read takes a fingerprint, and the bytes themselves are served
 * once by /brand/logo and cached by the browser for a year.
 */
export const IMAGE_SETTING_KEYS = ["logoUrl"] as const;
const TEXT_SETTING_KEYS = SETTING_KEYS.filter(
  (key) => !(IMAGE_SETTING_KEYS as readonly string[]).includes(key),
);

/** What the bulk read returns for an image key: enough to build a URL, no bytes. */
type ImageStamp = { fingerprint: string; isDataUrl: boolean; short: string };

const readStoredSettings = unstable_cache(
  async (): Promise<{ text: Record<string, string>; images: Record<string, ImageStamp> }> => {
    const [rows, stamps] = await Promise.all([
      prisma.siteSetting.findMany({
        where: { key: { in: TEXT_SETTING_KEYS } },
        select: { key: true, value: true },
      }),
      // md5 and a 5-character peek, computed in the database: a few dozen bytes
      // come back instead of the image. The digest changes when the logo does,
      // which is exactly what a cache-busting URL needs.
      prisma.$queryRaw<Array<{ key: string; fingerprint: string; head: string; short: string }>>`
        SELECT "key",
               md5("value") AS "fingerprint",
               substring("value" from 1 for 5) AS "head",
               -- An ordinary https:// logo is a few dozen characters and must
               -- still come back whole, or it would be lost on every read.
               -- Only something too big to be a URL is withheld.
               CASE WHEN length("value") <= 512 THEN "value" ELSE '' END AS "short"
        FROM "SiteSetting"
        WHERE "key" = ANY(${IMAGE_SETTING_KEYS as readonly string[]})
      `,
    ]);
    return {
      text: Object.fromEntries(rows.map((row) => [row.key, row.value])),
      images: Object.fromEntries(
        stamps.map((row) => [
          row.key,
          {
            fingerprint: (row.fingerprint ?? "").slice(0, 12),
            isDataUrl: row.head === "data:",
            short: row.short ?? "",
          },
        ]),
      ),
    };
  },
  ["site-settings"],
  { tags: [SETTINGS_TAG], revalidate: 300 },
);

/**
 * The bytes of one image setting. Only /brand/logo calls this, and only when a
 * browser actually asks for the image rather than on every page render.
 */
export const readImageSetting = unstable_cache(
  async (key: string): Promise<string | null> => {
    const row = await prisma.siteSetting.findUnique({ where: { key }, select: { value: true } });
    return row?.value ?? null;
  },
  ["site-setting-image"],
  { tags: [SETTINGS_TAG], revalidate: 3600 },
);

/** All settings merged with defaults. Resilient if the table doesn't exist yet. */
export const getSettings = cache(async (): Promise<Settings> => {
  const merged: Settings = { ...SETTINGS_DEFAULTS };
  try {
    const stored = await readStoredSettings();
    for (const key of TEXT_SETTING_KEYS) {
      const value = stored.text[key];
      if (value !== undefined) merged[key] = value;
    }
    // An image setting becomes a URL the page can link to. A stored http(s)
    // URL is already one and is left alone; a data: URL would otherwise be
    // inlined into the markup, so it is pointed at the route that serves it.
    for (const key of IMAGE_SETTING_KEYS) {
      const stamp = stored.images[key];
      if (!stamp) continue;
      merged[key] = stamp.isDataUrl
        ? `/brand/logo?v=${stamp.fingerprint}`
        : stamp.short;
    }
  } catch {
    // table not migrated yet — defaults only
  }
  merged.dataBundlesUrl = normaliseDataBundlesUrl(merged.dataBundlesUrl);
  return merged;
});


/** Platform default commission rate (percent). Falls back if unset/invalid. */
export async function getCommissionRate(): Promise<number> {
  const settings = await getSettings();
  const raw = (settings.commissionRate ?? "").trim();
  const rate = Number(raw);
  if (raw === "" || !Number.isFinite(rate) || rate < 0 || rate > 100) {
    return Number(SETTINGS_DEFAULTS.commissionRate);
  }
  return rate;
}

function percentSetting(raw: string | undefined, fallback: string): number {
  const value = (raw ?? "").trim();
  const rate = Number(value);
  if (value === "" || !Number.isFinite(rate) || rate < 0 || rate > 100) {
    return Number(fallback);
  }
  return rate;
}

/**
 * Default affiliate commission rate (percent of the item price), used when a
 * product and its category both leave the rate blank.
 */
export async function getAffiliateRate(): Promise<number> {
  const settings = await getSettings();
  return percentSetting(settings.affiliateRate, SETTINGS_DEFAULTS.affiliateRate);
}

/** The "earn up to X%" rate shown in public affiliate copy. */
export async function getAffiliateMaxRate(): Promise<number> {
  const settings = await getSettings();
  return percentSetting(settings.affiliateMaxRate, SETTINGS_DEFAULTS.affiliateMaxRate);
}

/** The public affiliate headline with {rate} filled in. Fully admin-editable. */
export async function getAffiliatePitch(): Promise<string> {
  const settings = await getSettings();
  const template = (settings.affiliatePitch ?? "").trim() || SETTINGS_DEFAULTS.affiliatePitch;
  const max = await getAffiliateMaxRate();
  return template.replace(/\{rate\}/g, String(max));
}

export type NotifyChannel = "sms" | "email" | "both";

/** Admin's chosen channel for staff order/job alerts. */
export async function getStaffNotifyChannel(): Promise<NotifyChannel> {
  const settings = await getSettings();
  const v = settings.staffNotifyChannel;
  return v === "sms" || v === "email" || v === "both" ? v : "both";
}


// ---------------------------------------------------------------------------
// Shipped from abroad
// ---------------------------------------------------------------------------

export interface AbroadConfig {
  /** Whether shipping may be settled at collection rather than at checkout. */
  payOnPickupEnabled: boolean;
  /** The consolidation point a listing with none of its own falls back to. */
  defaultPointId: string | null;
  pageTitle: string;
  pageIntro: string;
}

/** Platform-level settings for the shipped-from-abroad system. */
export async function getAbroadConfig(): Promise<AbroadConfig> {
  const settings = await getSettings();
  return {
    // Anything but an explicit off keeps the option available, so a half-written
    // value never quietly removes a payment plan buyers were relying on.
    payOnPickupEnabled: !["0", "off", "false", "no"].includes(
      settings.shipPayOnPickupEnabled.trim().toLowerCase(),
    ),
    defaultPointId: settings.shipDefaultPointId.trim() || null,
    pageTitle: settings.abroadPageTitle.trim() || SETTINGS_DEFAULTS.abroadPageTitle,
    pageIntro: settings.abroadPageIntro.trim() || SETTINGS_DEFAULTS.abroadPageIntro,
  };
}

// ---------------------------------------------------------------------------
// Data bundles and the agent programme
//
// Their settings moved to lib/data-bundles/settings.ts when the bundle business
// was split onto its own database — they are stored there, in DataSetting,
// alongside the orders they price. The keys below are what those settings fall
// back to for anything set before the split, which is why they are still
// listed in SETTINGS_DEFAULTS; nothing writes them any more.
// ---------------------------------------------------------------------------

export { normaliseDataBundlesUrl } from "@/lib/data-bundles/store-link";
