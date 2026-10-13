"use server";

import { revalidatePath, updateTag } from "next/cache";
import { requireAdmin } from "@/lib/session";
import {
  DATA_SETTINGS_TAG,
  getDataSettings,
  productCodesSettingKey,
  routeSettingKey,
  saveDataSettings,
} from "@/lib/data-bundles/settings";
import { NETWORKS } from "@/lib/data-bundles/networks";
import { carrierById } from "@/lib/data-bundles/carriers/registry";
import {
  carrierCatalogById,
  isCarrierId,
  RESELLER_ROUTE,
} from "@/lib/data-bundles/carriers/rules";
import {
  parseProductMapping,
  productCodesSubmittedField,
  serialiseProductMapping,
  sizeFromCodeField,
} from "@/lib/data-bundles/carriers/products";

/**
 * Saving the Developer tab.
 *
 * Its own action file rather than another branch of `updateDataSettings`,
 * because the two have different jobs — and keeping them apart means the
 * storefront's save path is not touched by any of this. The live console
 * behaves exactly as it did.
 *
 * There are only two kinds of thing to save, and one of each per network: the
 * route switch and the product codes. Every credential lives in the
 * environment, so nothing secret passes through this action, nothing secret is
 * written to the database, and there is no write-only field to get subtly
 * wrong.
 *
 * The switch is validated hardest. Product codes can be wrong and merely not
 * work; a route is the one field that changes what happens to a paying
 * customer's order, so it is refused unless the carrier behind it exists,
 * covers that network, and is actually provisioned.
 */

export type DeveloperSettingsState = {
  ok?: boolean;
  error?: string;
  notice?: string;
  fieldErrors?: Record<string, string>;
};

function str(fd: FormData, key: string): string {
  return String(fd.get(key) ?? "").trim();
}

export async function updateDeveloperSettings(
  _prev: DeveloperSettingsState,
  fd: FormData,
): Promise<DeveloperSettingsState> {
  await requireAdmin();

  const entries: Record<string, string> = {};
  let notice: string | undefined;

  // --- product codes -------------------------------------------------------
  // They arrive as one field per bundle — `carrierCode__MTN__5` for MTN's 5GB
  // — because the console builds its rows from the price ladder rather than
  // from a list kept here. Rebuilding the whole mapping from what was
  // submitted is what makes a cleared field actually clear the code; a merge
  // would leave no way to remove one.
  //
  // The per-network marker distinguishes "this form had no codes in it" from
  // "every code was cleared", and keeps one network's form from touching
  // another's mapping — which matters precisely because the rebuild is total.
  for (const network of NETWORKS) {
    if (!fd.has(productCodesSubmittedField(network))) continue;

    const codes: Array<[number, string]> = [];
    for (const [field, value] of fd.entries()) {
      const sizeGb = sizeFromCodeField(field, network);
      if (sizeGb === null) continue;
      codes.push([sizeGb, String(value ?? "")]);
    }
    // Sorted, trimmed, blanks dropped — so saving twice writes the same string.
    entries[productCodesSettingKey(network)] = serialiseProductMapping(codes);
  }

  // --- routes --------------------------------------------------------------
  for (const network of NETWORKS) {
    const field = routeSettingKey(network);
    if (!fd.has(field)) continue;

    const chosen = str(fd, field).toUpperCase();
    if (!isCarrierId(chosen)) {
      entries[field] = RESELLER_ROUTE;
      continue;
    }

    const entry = carrierCatalogById(chosen);
    const adapter = carrierById(chosen);
    if (!entry || !(entry.networks as readonly string[]).includes(network)) {
      return { error: `${chosen} does not serve ${network}.` };
    }
    if (!adapter) {
      return { error: `There is no ${entry.label} integration yet — ${network} stays with the current provider.` };
    }
    const label = entry.productLabel;

    const { ready, missing } = adapter.readiness();
    if (!ready) {
      return {
        error: `${network} orders stay with the current provider until these are set in the environment: ${missing.join(", ")}.`,
      };
    }

    if (adapter.usesProductCodes) {
      // Judged against what is *about* to be stored — what is already saved,
      // with this form's own on top — so a submission that pastes in the last
      // product code and flips the switch in one go is not refused for the
      // state things were in before it arrived. Built from a merged record
      // rather than a re-read, because a read taken straight after a write is
      // not reliably fresh: getDataSettings is memoised per request and cached
      // across them, and this is the one check that must not pass on stale
      // values.
      const stored = (await getDataSettings()) as unknown as Record<string, string>;
      const key = productCodesSettingKey(network);
      const raw =
        entries[key] ?? stored[key] ?? (network === "MTN" ? stored.mtnProductCodes : "") ?? "";
      if (parseProductMapping(raw).codes.size === 0) {
        return {
          error: `Add at least one ${label} product code before switching ${network} orders over.`,
        };
      }
    }

    entries[field] = chosen;
    notice = `${network} orders will now be delivered by ${label}.`;
  }

  if (Object.keys(entries).length === 0) return { ok: true };

  await saveDataSettings(entries);

  updateTag(DATA_SETTINGS_TAG);
  // "layout" so every carrier's tab is refreshed, not just the one posted
  // from — a saved switch changes the readiness note on the others too.
  revalidatePath("/admin/data/settings/developer", "layout");
  revalidatePath("/admin/data");
  return { ok: true, notice };
}

/**
 * Prove a carrier's credentials work, without moving anything.
 *
 * Whatever the carrier offers as a check that authenticates and does nothing
 * else — for MTN, a token request. It cannot transfer data, spend a line's
 * balance, or touch an order, which makes it the one check safe to offer as a
 * button on a live store, and the only way to tell a wrong secret from a
 * missing one without reading either.
 */
export async function testCarrierConnection(
  _prev: DeveloperSettingsState,
  fd: FormData,
): Promise<DeveloperSettingsState> {
  await requireAdmin();

  const carrierId = str(fd, "carrierId");
  const entry = carrierCatalogById(carrierId);
  const adapter = carrierById(carrierId);
  if (!entry) return { error: "No such carrier." };
  if (!adapter) return { error: `There is no ${entry.label} integration yet.` };
  if (!adapter.test) return { error: `${entry.productLabel} offers no connection test.` };

  const res = await adapter.test();
  if (!res.ok) return { error: res.message };
  const label = entry.productLabel;

  const { missing } = adapter.readiness();
  // Credentials that just authenticated are not what is missing, whatever the
  // readiness check said a moment ago.
  const outstanding = missing.filter((m) => !/CLIENT_(ID|SECRET)$/.test(m));
  return {
    ok: true,
    notice: outstanding.length
      ? `${label} accepted the credentials. Still needed before orders can route: ${outstanding.join(", ")}.`
      : `${label} accepted the credentials.`,
  };
}
