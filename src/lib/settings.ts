import "server-only";
import { cache } from "react";
import { prisma } from "@/lib/prisma";
import { DELIVERY_DEFAULTS, type DeliveryConfig } from "@/lib/delivery";
import type { ShippingRates } from "@/lib/shipping";

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
  supportEmail: "support@nikimart.gh",
  supportPhone: "030 000 0000",
  businessHours: "Mon–Sat, 8am–7pm",
  liveChatStatus: "Coming soon",
  footerTagline: "Shop smart. Sell faster. Deliver closer.",
  footerNote: "Buy local. Preorder global. Shop NikiMart.",
  restrictionsText:
    "NikiMart restricts dangerous, illegal, and age-restricted products including weapons, alcohol, nicotine, drugs, gambling, adult content, counterfeit goods, and prescription medicine.",
  copyrightName: "NikiMart",
  // Brand logo (http(s) URL or a data: URL). Empty → bundled /logo.png.
  logoUrl: "",
  // External data-bundles storefront (agent shop). Empty hides the shortcuts.
  dataBundlesUrl: "https://www.4ubundles.store/store/Nickland",
  // Platform commission (percent) taken on every sale. Sellers register free
  // and NikiMart earns this cut per item; overridable per category.
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
  // NikiMart's own social media handles (full URLs). Empty = hidden.
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
  // Empty = the first active pickup point.
  internationalArrivalHubId: "",
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
