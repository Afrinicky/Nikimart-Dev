"use server";

import { revalidatePath, updateTag } from "next/cache";
import { requireAdmin } from "@/lib/session";
import {
  DATA_SETTINGS_TAG,
  getDataSettings,
  saveDataSettings,
} from "@/lib/data-bundles/settings";
import { buildMtnConfig, getMtnConfig } from "@/lib/data-bundles/mtn/config";
import { testMtnCredentials } from "@/lib/data-bundles/mtn/client";

/**
 * Saving the Developer tab.
 *
 * Its own action file rather than another branch of `updateDataSettings`,
 * because the two have different jobs — and keeping them apart means the
 * storefront's save path is not touched by any of this. The live console
 * behaves exactly as it did.
 *
 * There are only two things to save here. Every credential lives in the
 * environment, so nothing secret passes through this action, nothing secret is
 * written to the database, and there is no write-only field to get subtly
 * wrong. What is left is the route switch and the product code list.
 *
 * The switch is validated hardest. The product list can be wrong and merely
 * not work; `dataRouteMTN` is the one field that changes what happens to a
 * paying customer's order, so it is refused unless the environment behind it
 * is actually provisioned.
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

  // Saved as typed, newlines and all — mtn/products.ts is what interprets it,
  // and it reports the lines it cannot read rather than discarding them.
  if (fd.has("mtnProductCodes")) {
    entries.mtnProductCodes = String(fd.get("mtnProductCodes") ?? "").trim();
  }

  let notice: string | undefined;

  if (fd.has("dataRouteMTN")) {
    const route = str(fd, "dataRouteMTN").toUpperCase() === "MTN" ? "MTN" : "JUSTICE";

    if (route === "MTN") {
      // Judged against what is *about* to be stored — what is already saved,
      // with this form's own on top — so a submission that pastes in the last
      // product code and flips the switch in one go is not refused for the
      // state things were in before it arrived.
      //
      // Built from a merged record rather than from a re-read, because a read
      // taken straight after a write is not reliably fresh (see
      // buildMtnConfig) and this is the one check that must not pass on stale
      // values.
      const merged = { ...(await getDataSettings()), ...entries, dataRouteMTN: "MTN" };
      const config = buildMtnConfig(merged);

      if (config.missing.length > 0) {
        return {
          error: `MTN orders stay with the current provider until these are set in the environment: ${config.missing.join(", ")}.`,
        };
      }
      if (config.products.codes.size === 0) {
        return {
          error:
            "Add at least one bundle size to the product code list before switching MTN orders over.",
        };
      }
      notice = "MTN orders will now be transferred from your MTN line.";
    }

    entries.dataRouteMTN = route;
  }

  if (Object.keys(entries).length === 0) return { ok: true };

  await saveDataSettings(entries);

  updateTag(DATA_SETTINGS_TAG);
  revalidatePath("/admin/data/settings/developer");
  revalidatePath("/admin/data");
  return { ok: true, notice };
}

/**
 * Prove the environment's credentials work, without moving anything.
 *
 * A token request authenticates and does nothing else — it cannot transfer
 * data, cannot spend the line's balance, and cannot touch an order. That makes
 * it the one check safe to offer as a button on a live store, and the only way
 * to tell a wrong secret from a missing one without reading the secret.
 */
export async function testMtnConnection(
  _prev: DeveloperSettingsState,
  _fd: FormData,
): Promise<DeveloperSettingsState> {
  await requireAdmin();

  const config = await getMtnConfig();
  if (!config.clientId || !config.clientSecret) {
    return { error: "Set MTN_CLIENT_ID and MTN_CLIENT_SECRET in the environment first." };
  }

  const res = await testMtnCredentials(config);
  if (!res.ok) return { error: res.message };

  const outstanding = config.missing.filter(
    (m) => m !== "MTN_CLIENT_ID" && m !== "MTN_CLIENT_SECRET",
  );
  return {
    ok: true,
    notice: outstanding.length
      ? `MTN accepted the credentials. Still needed before orders can route: ${outstanding.join(", ")}.`
      : "MTN accepted the credentials.",
  };
}
