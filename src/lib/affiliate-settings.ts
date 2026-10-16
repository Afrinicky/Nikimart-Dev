import "server-only";
import { cache } from "react";
import { getSettings } from "@/lib/settings";
import {
  resolveAffiliatePolicy,
  resolveAffiliateReferralConfig,
  type AffiliatePolicy,
  type AffiliateReferralConfig,
} from "@/lib/affiliate-policy";

/**
 * The affiliate programme's policy, read once per request.
 *
 * A thin server wrapper so the rules themselves can stay pure (and tested) in
 * lib/affiliate-policy while every caller — checkout, the console, the admin
 * screens — reads them the same way from the same place.
 */
export const getAffiliatePolicy = cache(async (): Promise<AffiliatePolicy> => {
  const settings = await getSettings();
  return resolveAffiliatePolicy(settings as unknown as Record<string, string>);
});

/**
 * The referral programme's settings, read once per request.
 *
 * Separate from the policy above because the two are consulted in different
 * places: every checkout reads the policy, and only the team screens and an
 * approval read this.
 */
export const getAffiliateReferralConfig = cache(async (): Promise<AffiliateReferralConfig> => {
  const settings = await getSettings();
  return resolveAffiliateReferralConfig(settings as unknown as Record<string, string>);
});

export type { AffiliatePolicy, AffiliateReferralConfig };
