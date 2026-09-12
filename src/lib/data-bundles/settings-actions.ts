"use server";

import { revalidatePath, updateTag } from "next/cache";
import { requireAdmin } from "@/lib/session";
import { DATA_SETTINGS_DEFAULTS, DATA_SETTINGS_TAG, saveDataSettings } from "@/lib/data-bundles/settings";
import { LEADERBOARD_TAG } from "@/lib/data-bundles/leaderboard";

/**
 * Saving settings in the data-bundle console.
 *
 * Separate from the retail `updateSettings` because the rows are in a different
 * database now. Same rule though: only keys the form actually submitted are
 * written, so a save on the Store settings tab never blanks the referral rates
 * on another one.
 */

export type DataSettingsState = { ok?: boolean; error?: string; fieldErrors?: Record<string, string> };

function str(fd: FormData, key: string): string {
  return String(fd.get(key) ?? "").trim();
}

/** Fields that are money or percentages and must not be negative. */
const NON_NEGATIVE: Array<[string, string]> = [
  ["dataAfaPrice", "AFA price"],
  ["dataMarkupPercent", "Default markup"],
  ["dataLowBalanceThreshold", "Low balance alert"],
  ["agentSetupFee", "Registration fee"],
  ["agentWithdrawalFee", "Withdrawal fee"],
  ["agentMinWithdrawal", "Minimum withdrawal"],
  ["agentAgentMarkupPercent", "Agent discount"],
  ["referralLevel1Reward", "Direct referral reward"],
  ["referralLevel2Reward", "Second-level referral reward"],
  ["referralTeamCommissionDefault", "Default team-sales commission"],
  ["referralMinSaleAmount", "Minimum qualifying sale"],
  ["referralMinSaleCommission", "Minimum qualifying commission"],
  ["referralDailyRewardCap", "Daily reward cap"],
  ["referralWaiverDefaultPercent", "Default registration waiver"],
  ["referralWaiverReferrerSharePercent", "Referrer share of the fee"],
  ["leaderboardSize", "Leaderboard size"],
  ["leaderboardMinAgentAgeDays", "Minimum agent age"],
  ["leaderboardMinQualifyingSales", "Minimum qualifying sales"],
  ["leaderboardWindowDays", "Performance window"],
  ["leaderboardPoints1st", "Points for 1st"],
  ["leaderboardPoints2nd", "Points for 2nd"],
  ["leaderboardPoints3rd", "Points for 3rd"],
  ["leaderboardExcellentSales", "Excellent performance"],
  ["leaderboardExcellentPoints", "Points for an excellent performance"],
  ["leaderboardExceptionalSales", "Exceptional performance"],
  ["leaderboardExceptionalPoints", "Points for an exceptional performance"],
];

/** Fields that are percentages: zero to a hundred, and nothing outside it. */
const PERCENTAGES: Array<[string, string]> = [
  ["referralWaiverDefaultPercent", "Default registration waiver"],
  ["referralWaiverReferrerSharePercent", "Referrer share of the fee"],
];

export async function updateDataSettings(
  _prev: DataSettingsState,
  fd: FormData,
): Promise<DataSettingsState> {
  await requireAdmin();

  for (const [key, label] of NON_NEGATIVE) {
    if (!fd.has(key)) continue;
    const raw = str(fd, key);
    if (raw === "") continue;
    const n = Number(raw);
    if (!Number.isFinite(n) || n < 0) {
      return { error: `${label} must be zero or more.`, fieldErrors: { [key]: "Enter a number." } };
    }
  }

  for (const [key, label] of PERCENTAGES) {
    if (!fd.has(key)) continue;
    const raw = str(fd, key);
    if (raw === "") continue;
    const n = Number(raw);
    if (!Number.isFinite(n) || n < 0 || n > 100) {
      return {
        error: `${label} must be between 0 and 100 percent.`,
        fieldErrors: { [key]: "Enter a percentage." },
      };
    }
  }

  const entries: Record<string, string> = {};
  for (const key of Object.keys(DATA_SETTINGS_DEFAULTS)) {
    if (fd.has(key)) entries[key] = str(fd, key);
  }
  if (Object.keys(entries).length === 0) return { ok: true };

  await saveDataSettings(entries);

  // Every screen the settings drive is force-dynamic, but the public storefront
  // and the recruitment page are not, and both read them.
  updateTag(DATA_SETTINGS_TAG);
  revalidatePath("/data-bundles");
  revalidatePath("/become-an-agent");
  revalidatePath("/admin/data/settings");
  revalidatePath("/admin/data/referrals");
  revalidatePath("/admin/data/leaderboard");
  // The agent screens that read these are force-dynamic, but the boards
  // themselves are cached for a minute and keyed on the settings — dropping
  // the tag means a change to what they measure shows on the next load rather
  // than on the next minute.
  updateTag(LEADERBOARD_TAG);
  revalidatePath("/agent");
  revalidatePath("/agent/leaderboard");
  return { ok: true };
}
