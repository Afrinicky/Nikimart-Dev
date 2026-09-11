import "server-only";
import { cache } from "react";
import { dataDb } from "@/lib/data-db";
import { getSettings as getRetailSettings } from "@/lib/settings";

/**
 * Settings for the data-bundle business, stored in the data-bundle database.
 *
 * The retail side keeps its own SiteSetting table; this is the bundle side's,
 * and it lives next to the orders it prices. Restore this database and the
 * price ladder, the agent programme and the referral rates come back in step
 * with the orders they applied to, rather than from whatever the retail
 * database happened to hold at the time.
 *
 * Keys that predate the split fall back to the retail value when the bundle
 * database has no row of its own, so the day the two are separated nothing
 * silently reverts to a default. The first save in the data console writes the
 * value here and the fallback stops mattering.
 */

export const DATA_SETTINGS_DEFAULTS = {
  // --- Bundle storefront ----------------------------------------------------
  // Master switch. "0" takes the storefront offline (browsing and buying) while
  // leaving the admin console reachable.
  dataBundlesEnabled: "1",
  dataStoreName: "Nickimart Data",
  dataStoreTagline: "MTN, Telecel & AirtelTigo bundles — delivered in seconds.",
  dataSupportWhatsapp: "",
  dataAfaEnabled: "1",
  dataAfaPrice: "12",
  dataMarkupPercent: "25",
  dataLowBalanceThreshold: "50",

  // --- Sub-agent programme --------------------------------------------------
  agentProgramEnabled: "1",
  agentSetupFee: "30",
  agentWithdrawalFee: "1",
  agentMinWithdrawal: "10",
  agentAgentMarkupPercent: "12",
  agentSupportPhone: "",
  agentSupportWhatsapp: "",
  agentWhatsappGroup: "",
  agentPitch:
    "Resell MTN, Telecel and AirtelTigo bundles under your own store name. You set the prices, we deliver the data.",

  // --- Referral & team earnings --------------------------------------------
  // Master switch for the whole programme. "0" stops new relationships being
  // recorded and stops every reward and team commission being paid; existing
  // relationships and everything already earned are left alone.
  referralEnabled: "1",
  // What an agent earns for recruiting someone directly (GH₵), and for a
  // recruit of that recruit. Paid once each, and only after the new agent's
  // registration fee has actually been paid — a waived fee pays nobody.
  referralLevel1Reward: "10",
  referralLevel2Reward: "4",
  // Whether the second level pays at all. Turning it off leaves direct
  // referrals working and is the quickest way to close the tier without
  // rewriting the rewards.
  referralLevel2Enabled: "1",
  // The team-sales commission an agent earns on their *direct* recruits' sales
  // when the bundle sold carries no amount of its own. Per-bundle amounts are
  // set on the Bundle prices tab; this is the fallback for the rest.
  referralTeamCommissionDefault: "0",
  // What counts as a qualifying sale for the team commission:
  //   the sale price must be at least this,
  referralMinSaleAmount: "0",
  //   and the selling agent's own commission must be at least this. A sale an
  //   agent made no margin on is usually a price mistake, not team-building.
  referralMinSaleCommission: "0",
  // Whether AFA registrations sold by a recruit count as qualifying sales.
  referralAfaQualifies: "0",
  // The most referral *rewards* (not sales commission) one agent may be paid in
  // a rolling 24 hours. The brake on farmed signups: real recruitment does not
  // arrive in bursts, and every account still needs an admin's approval and a
  // paid registration fee before it pays anything. "0" removes the cap.
  referralDailyRewardCap: "5",
  // The line shown to agents above their referral link.
  referralPitch:
    "Share your agent code. Earn when the people you bring on board register, and keep earning from what they sell.",
} as const;

export type DataSettingKey = keyof typeof DATA_SETTINGS_DEFAULTS;
export type DataSettings = Record<DataSettingKey, string>;

/**
 * Keys that existed in the retail SiteSetting table before the split. Their
 * retail value is used when this database has no row, so separating the two
 * never resets a price or a switch an admin had already set.
 */
const INHERITED_FROM_RETAIL: DataSettingKey[] = [
  "dataBundlesEnabled", "dataStoreName", "dataStoreTagline", "dataSupportWhatsapp",
  "dataAfaEnabled", "dataAfaPrice", "dataMarkupPercent", "dataLowBalanceThreshold",
  "agentProgramEnabled", "agentSetupFee", "agentWithdrawalFee", "agentMinWithdrawal",
  "agentAgentMarkupPercent", "agentSupportPhone", "agentSupportWhatsapp",
  "agentWhatsappGroup", "agentPitch",
];

/**
 * Every setting, defaults filled in. Cached per request: a page that reads the
 * store config and the referral config asks the database once.
 */
export const getDataSettings = cache(async (): Promise<DataSettings> => {
  const merged = { ...DATA_SETTINGS_DEFAULTS } as DataSettings;

  // The retail values first, so anything set before the split still applies…
  try {
    const retail = await getRetailSettings();
    for (const key of INHERITED_FROM_RETAIL) {
      const value = (retail as Record<string, string | undefined>)[key];
      if (typeof value === "string" && value !== "") merged[key] = value;
    }
  } catch {
    // Retail settings unreachable — the defaults above still give a complete set.
  }

  // …then this database's own, which win wherever they exist.
  try {
    const rows = await dataDb.dataSetting.findMany();
    for (const row of rows) {
      if (row.key in merged) merged[row.key as DataSettingKey] = row.value;
    }
  } catch {
    // DataSetting not migrated yet — inherited values and defaults still stand.
  }

  return merged;
});

/** Write settings. Only known keys are accepted; anything else is ignored. */
export async function saveDataSettings(entries: Record<string, string>): Promise<void> {
  const known = Object.keys(DATA_SETTINGS_DEFAULTS) as DataSettingKey[];
  const writes = known
    .filter((key) => key in entries)
    .map((key) =>
      dataDb.dataSetting.upsert({
        where: { key },
        create: { key, value: String(entries[key] ?? "") },
        update: { value: String(entries[key] ?? "") },
      }),
    );
  if (writes.length) await dataDb.$transaction(writes);
}

// ---------------------------------------------------------------------------
// Typed views
// ---------------------------------------------------------------------------

/** True unless the value is an explicit off, so a half-written value is never a switch-off. */
function on(raw: string): boolean {
  return !["0", "off", "false", "no"].includes(raw.trim().toLowerCase());
}

function numOr(raw: string, fallback: number): number {
  const n = Number(raw);
  return Number.isFinite(n) && n >= 0 ? n : fallback;
}

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
  const s = await getDataSettings();
  return {
    enabled: on(s.dataBundlesEnabled),
    name: s.dataStoreName.trim() || "Nickimart Data",
    tagline: s.dataStoreTagline.trim(),
    whatsapp: s.dataSupportWhatsapp.trim(),
    afaEnabled: on(s.dataAfaEnabled),
    afaPrice: numOr(s.dataAfaPrice, 12),
    markupPercent: numOr(s.dataMarkupPercent, 25),
    lowBalanceThreshold: numOr(s.dataLowBalanceThreshold, 50),
  };
}

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
  const [s, retail] = await Promise.all([
    getDataSettings(),
    // Only for the two support contacts, which fall back to the site-wide ones.
    getRetailSettings().catch(() => null),
  ]);
  return {
    enabled: on(s.agentProgramEnabled),
    setupFee: numOr(s.agentSetupFee, 30),
    withdrawalFee: numOr(s.agentWithdrawalFee, 1),
    minWithdrawal: numOr(s.agentMinWithdrawal, 10),
    agentDiscountPercent: numOr(s.agentAgentMarkupPercent, 12),
    supportPhone: s.agentSupportPhone.trim() || (retail?.supportPhone ?? "").trim(),
    supportWhatsapp: s.agentSupportWhatsapp.trim() || s.dataSupportWhatsapp.trim(),
    whatsappGroup: s.agentWhatsappGroup.trim(),
    pitch: s.agentPitch.trim(),
  };
}

export interface ReferralConfig {
  enabled: boolean;
  /** GH₵ paid to the direct recruiter once the new agent's fee is paid. */
  level1Reward: number;
  /** GH₵ paid to the recruiter's recruiter. Zero when the tier is off. */
  level2Reward: number;
  level2Enabled: boolean;
  /** Team-sales commission for bundles that carry no amount of their own. */
  teamCommissionDefault: number;
  /** A sale qualifies only at or above these. */
  minSaleAmount: number;
  minSaleCommission: number;
  afaQualifies: boolean;
  /** Referral rewards one agent may be paid in a rolling 24h. 0 = no cap. */
  dailyRewardCap: number;
  pitch: string;
}

/**
 * The referral rules as they stand right now.
 *
 * Every calculation reads this rather than a constant, so changing a reward in
 * the admin console changes what the next commission pays without a deploy.
 * Amounts already earned are snapshotted on the order or written to the ledger,
 * so a change never rewrites what somebody was already owed.
 */
export async function getReferralConfig(): Promise<ReferralConfig> {
  const s = await getDataSettings();
  const level2Enabled = on(s.referralLevel2Enabled);
  return {
    enabled: on(s.referralEnabled),
    level1Reward: numOr(s.referralLevel1Reward, 0),
    level2Reward: level2Enabled ? numOr(s.referralLevel2Reward, 0) : 0,
    level2Enabled,
    teamCommissionDefault: numOr(s.referralTeamCommissionDefault, 0),
    minSaleAmount: numOr(s.referralMinSaleAmount, 0),
    minSaleCommission: numOr(s.referralMinSaleCommission, 0),
    // Off by default: an AFA registration is a one-off, not a bundle sale.
    afaQualifies: s.referralAfaQualifies.trim() === "1",
    dailyRewardCap: numOr(s.referralDailyRewardCap, 0),
    pitch: s.referralPitch.trim(),
  };
}
