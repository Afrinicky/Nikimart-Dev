import "server-only";
import { cache } from "react";
import { getSettings } from "@/lib/settings";
import { resolveAffiliatePolicy, type AffiliatePolicy } from "@/lib/affiliate-policy";

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

export type { AffiliatePolicy };
