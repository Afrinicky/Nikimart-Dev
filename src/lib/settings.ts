import "server-only";
import { cache } from "react";
import { prisma } from "@/lib/prisma";
import { DELIVERY_DEFAULTS, type DeliveryConfig } from "@/lib/delivery";
import type { ShippingRates } from "@/lib/shipping";
import { normaliseDataBundlesUrl } from "@/lib/data-bundles/store-link";

// Site-wide settings stored as key/value rows, merged with these defaults.
export const SETTINGS_DEFAULTS = {
  deliveryFee: "20",
  // Delivery-fee engine (Jumia-style): base + per-kg, and a flat pickup fee.
  deliveryPerKg: "5",
  pickupFee: "0",
  // Price the per-kg component by "weight" or "size" (volumetric weight).
  deliveryBasis: "weight",
  // cm³ per volumetric kg when using size basis (courier standard ~5000).
  volumetricDivisor: "5000",
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
  // --- Sub-agent programme --------------------------------------------------
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
  // Overseas shipping lead times (days to arrive in Ghana), per origin.
  leadDaysCN: "21",
  leadDaysAE: "14",
  leadDaysUS: "21",
  leadDaysEU: "21",
  // --- CBM shipping-fee engine (pickup-only) --------------------------------
  // Fallback domestic rate (GH₵ per CBM) when a specific origin→pickup route
  // rate isn't configured in the Shipping rates table.
  shippingDefaultRatePerCbm: "150",
  // International rate (GH₵ per CBM) for the abroad→Ghana leg, per origin
  // country, plus a fallback for other countries.
  intlRatePerCbmCN: "1200",
  intlRatePerCbmAE: "1000",
  intlRatePerCbmUS: "1500",
  intlRatePerCbmEU: "1500",
  intlDefaultRatePerCbm: "1500",
  // Pickup point where goods shipped from abroad land before the domestic leg.
  // Empty = the first active pickup point. Superseded per-listing by the Ghana
  // arrival point the seller chooses; this stays as the fallback.
  internationalArrivalHubId: "",
  // --- Shipped from abroad --------------------------------------------------
  // Ghana VAT + levies (percent) applied to the landed value plus duty of an
  // imported order, when a listing doesn't set its own rate. 15% VAT plus the
  // NHIL/GETFund/COVID levies is the usual standing figure.
  ghanaImportTaxRate: "21.9",
  // Fallback Ghana import duty (percent of CIF) for an arrival point that has
  // not had its own duty set.
  defaultImportDutyPercent: "20",
  // Whether buyers may pay for the goods now and settle the freight legs, duty
  // and Ghana tax when the item lands. "0" forces payment in full. A listing
  // can still decline it; this is the platform-level switch.
  abroadPartialPaymentEnabled: "1",
  // The public heading and blurb on /shipped-from-abroad.
  abroadPageTitle: "Shipped from Abroad",
  abroadPageIntro:
    "Sellers source these from suppliers in China, Dubai, the USA and Europe. You order here, we freight it in, and you collect it at your pickup point. Ordering stays open — nothing closes.",
} as const;

export type SettingKey = keyof typeof SETTINGS_DEFAULTS;
export type Settings = Record<SettingKey, string>;

export const SETTING_KEYS = Object.keys(SETTINGS_DEFAULTS) as SettingKey[];

/** All settings merged with defaults. Resilient if the table doesn't exist yet. */
export const getSettings = cache(async (): Promise<Settings> => {
  const merged: Settings = { ...SETTINGS_DEFAULTS };
  try {
    const rows = await prisma.siteSetting.findMany();
    for (const row of rows) {
      if ((SETTING_KEYS as string[]).includes(row.key)) {
        merged[row.key as SettingKey] = row.value;
      }
    }
  } catch {
    // table not migrated yet — defaults only
  }
  merged.dataBundlesUrl = normaliseDataBundlesUrl(merged.dataBundlesUrl);
  return merged;
});


/** Numeric delivery fee (GH₵). */
export async function getDeliveryFee(): Promise<number> {
  const settings = await getSettings();
  const fee = Number(settings.deliveryFee);
  return Number.isFinite(fee) && fee >= 0 ? fee : Number(SETTINGS_DEFAULTS.deliveryFee);
}

/** Delivery-fee engine configuration (base + per-kg + pickup), from settings. */
export async function getDeliveryConfig(): Promise<DeliveryConfig> {
  const settings = await getSettings();
  const numOr = (raw: string, fallback: number) => {
    const n = Number(raw);
    return Number.isFinite(n) && n >= 0 ? n : fallback;
  };
  const basis = settings.deliveryBasis === "size" ? "size" : "weight";
  return {
    baseFee: numOr(settings.deliveryFee, DELIVERY_DEFAULTS.baseFee),
    perKgRate: numOr(settings.deliveryPerKg, DELIVERY_DEFAULTS.perKgRate),
    pickupFee: numOr(settings.pickupFee, DELIVERY_DEFAULTS.pickupFee),
    basis,
    volumetricDivisor: numOr(settings.volumetricDivisor, DELIVERY_DEFAULTS.volumetricDivisor),
  };
}

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

/** Configured overseas lead time (days) for an origin country code. */
export async function getLeadDays(countryCode: string): Promise<number> {
  const settings = await getSettings();
  const key = `leadDays${countryCode}` as SettingKey;
  const raw = key in settings ? Number(settings[key]) : NaN;
  return Number.isFinite(raw) && raw >= 0 ? raw : 21;
}

/** The CBM shipping-rate tables (default + configured routes + international). */
export async function getShippingRates(): Promise<ShippingRates> {
  const settings = await getSettings();
  const numOr = (raw: string, fallback: number) => {
    const n = Number(raw);
    return Number.isFinite(n) && n >= 0 ? n : fallback;
  };

  const routes: Record<string, number> = {};
  let arrivalHubId: string | null = settings.internationalArrivalHubId || null;
  try {
    const rows = await prisma.shippingRate.findMany();
    for (const r of rows) routes[`${r.originHubId}|${r.destPickupId}`] = r.ratePerCbm;
    if (!arrivalHubId) {
      const first = await prisma.pickupPoint.findFirst({
        where: { isActive: true },
        orderBy: { createdAt: "asc" },
        select: { id: true },
      });
      arrivalHubId = first?.id ?? null;
    }
  } catch {
    // table not migrated yet — default rate only
  }

  return {
    defaultRatePerCbm: numOr(settings.shippingDefaultRatePerCbm, 150),
    routes,
    intlRatePerCbm: {
      CN: numOr(settings.intlRatePerCbmCN, 1200),
      AE: numOr(settings.intlRatePerCbmAE, 1000),
      US: numOr(settings.intlRatePerCbmUS, 1500),
      EU: numOr(settings.intlRatePerCbmEU, 1500),
    },
    intlDefaultRatePerCbm: numOr(settings.intlDefaultRatePerCbm, 1500),
    arrivalHubId,
  };
}

// ---------------------------------------------------------------------------
// Shipped from abroad
// ---------------------------------------------------------------------------

export interface AbroadConfig {
  /** Ghana VAT + levies (percent) on the landed value plus duty. */
  ghanaTaxRate: number;
  /** Fallback import duty (percent of CIF) when an arrival point sets none. */
  defaultDutyPercent: number;
  /** Whether the goods-only payment plan is offered at all. */
  partialPaymentEnabled: boolean;
  pageTitle: string;
  pageIntro: string;
}

/** Platform-level settings for the shipped-from-abroad system. */
export async function getAbroadConfig(): Promise<AbroadConfig> {
  const settings = await getSettings();
  const numOr = (raw: string, fallback: number) => {
    const n = Number(raw);
    return Number.isFinite(n) && n >= 0 && n <= 100 ? n : fallback;
  };
  return {
    ghanaTaxRate: numOr(settings.ghanaImportTaxRate, Number(SETTINGS_DEFAULTS.ghanaImportTaxRate)),
    defaultDutyPercent: numOr(
      settings.defaultImportDutyPercent,
      Number(SETTINGS_DEFAULTS.defaultImportDutyPercent),
    ),
    // Anything but an explicit off keeps the option available, so a half-written
    // value never quietly removes a payment plan buyers were relying on.
    partialPaymentEnabled: !["0", "off", "false", "no"].includes(
      settings.abroadPartialPaymentEnabled.trim().toLowerCase(),
    ),
    pageTitle: settings.abroadPageTitle.trim() || SETTINGS_DEFAULTS.abroadPageTitle,
    pageIntro: settings.abroadPageIntro.trim() || SETTINGS_DEFAULTS.abroadPageIntro,
  };
}

// ---------------------------------------------------------------------------
// Data bundle storefront
// ---------------------------------------------------------------------------

export interface DataStoreConfig {
  enabled: boolean;
  name: string;
  tagline: string;
  whatsapp: string;
  afaEnabled: boolean;
  afaPrice: number;
  markupPercent: number;
  lowBalanceThreshold: number;
}

/** Storefront configuration for /data-bundles, merged with defaults. */
export async function getDataStoreConfig(): Promise<DataStoreConfig> {
  const settings = await getSettings();
  const numOr = (raw: string, fallback: number) => {
    const n = Number(raw);
    return Number.isFinite(n) && n >= 0 ? n : fallback;
  };
  return {
    // Anything other than an explicit "0"/"off" keeps the store open, so a
    // half-written value never silently takes the storefront down.
    enabled: !["0", "off", "false", "no"].includes(settings.dataBundlesEnabled.trim().toLowerCase()),
    name: settings.dataStoreName.trim() || "Nickimart Data",
    tagline: settings.dataStoreTagline.trim(),
    whatsapp: settings.dataSupportWhatsapp.trim(),
    afaEnabled: !["0", "off", "false", "no"].includes(settings.dataAfaEnabled.trim().toLowerCase()),
    afaPrice: numOr(settings.dataAfaPrice, 12),
    markupPercent: numOr(settings.dataMarkupPercent, 25),
    lowBalanceThreshold: numOr(settings.dataLowBalanceThreshold, 50),
  };
}

// ---------------------------------------------------------------------------
// Sub-agent programme
// ---------------------------------------------------------------------------

export interface AgentProgramConfig {
  enabled: boolean;
  setupFee: number;
  withdrawalFee: number;
  minWithdrawal: number;
  /** Suggested discount (percent off retail) for the agent price. */
  agentDiscountPercent: number;
  supportPhone: string;
  supportWhatsapp: string;
  whatsappGroup: string;
  pitch: string;
}

/** Configuration for /agent and the recruitment page, merged with defaults. */
export async function getAgentProgramConfig(): Promise<AgentProgramConfig> {
  const settings = await getSettings();
  const numOr = (raw: string, fallback: number) => {
    const n = Number(raw);
    return Number.isFinite(n) && n >= 0 ? n : fallback;
  };
  return {
    enabled: !["0", "off", "false", "no"].includes(settings.agentProgramEnabled.trim().toLowerCase()),
    setupFee: numOr(settings.agentSetupFee, 30),
    withdrawalFee: numOr(settings.agentWithdrawalFee, 1),
    minWithdrawal: numOr(settings.agentMinWithdrawal, 10),
    agentDiscountPercent: numOr(settings.agentAgentMarkupPercent, 12),
    supportPhone: settings.agentSupportPhone.trim() || settings.supportPhone.trim(),
    supportWhatsapp: settings.agentSupportWhatsapp.trim() || settings.dataSupportWhatsapp.trim(),
    whatsappGroup: settings.agentWhatsappGroup.trim(),
    pitch: settings.agentPitch.trim(),
  };
}

export { normaliseDataBundlesUrl } from "@/lib/data-bundles/store-link";
