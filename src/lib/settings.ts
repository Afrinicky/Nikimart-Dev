import "server-only";
import { cache } from "react";
import { prisma } from "@/lib/prisma";

// Site-wide settings stored as key/value rows, merged with these defaults.
export const SETTINGS_DEFAULTS = {
  deliveryFee: "20",
  supportEmail: "support@nikimart.gh",
  supportPhone: "030 000 0000",
  businessHours: "Mon–Sat, 8am–7pm",
  liveChatStatus: "Coming soon",
  footerTagline: "Shop smart. Sell faster. Deliver closer.",
  footerNote: "Buy local. Preorder global. Shop NikiMart.",
  restrictionsText:
    "NikiMart restricts dangerous, illegal, and age-restricted products including weapons, alcohol, nicotine, drugs, gambling, adult content, counterfeit goods, and prescription medicine.",
  copyrightName: "NikiMart",
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
