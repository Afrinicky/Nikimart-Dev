import "server-only";
import { cache } from "react";
import { getSettings } from "@/lib/settings";
import {
  COMPUTE_DEFAULTS,
  resolveComputeSettings,
  type ComputeSettings,
  type CrawlerPolicy,
} from "@/lib/compute-rules";

export type { ComputeSettings, CrawlerPolicy };

/**
 * What the site is allowed to spend CPU on.
 *
 * The decisions live in lib/compute-rules.ts, which is tested; this is the
 * part that reads them. It exists as a module of its own, rather than every
 * consumer calling `getSettings()` and interpreting the strings itself,
 * because `lowComputeMode` has to force the cheapest answer everywhere at once
 * without overwriting what the admin chose — and a rule like that belongs in
 * one place rather than at eleven call sites.
 *
 * Reading is cheap. `getSettings` is backed by a cached read with a
 * thirty-minute window and a tag every settings write drops, and `cache`
 * dedupes it within a request — so a page that asks three times asks once.
 *
 * What each switch actually costs is in docs/compute-audit.md.
 */
export const getComputeSettings = cache(async (): Promise<ComputeSettings> => {
  return resolveComputeSettings(await getSettings());
});

/**
 * The same thing where a settings read must not throw.
 *
 * Every consumer of this module sits on a path where failing is worse than
 * being expensive: a sleeping database must not take the sitemap away, close
 * the chat, or turn a product's link preview into a blank square. So the whole
 * read is wrapped, and a failure is the site at full strength with nothing
 * forced — which is exactly what it did before any of these switches existed.
 */
export async function computeSettingsOrDefaults(): Promise<ComputeSettings> {
  try {
    return await getComputeSettings();
  } catch {
    return COMPUTE_DEFAULTS;
  }
}
