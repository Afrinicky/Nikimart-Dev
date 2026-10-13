"use server";

import { revalidatePath, updateTag } from "next/cache";
import { requireAdmin } from "@/lib/session";
import { DATA_SETTINGS_TAG, getDataSettings, saveDataSettings } from "@/lib/data-bundles/settings";
import { buildMtnConfig, getMtnConfig } from "@/lib/data-bundles/mtn/config";
import { forgetMtnToken, testMtnCredentials } from "@/lib/data-bundles/mtn/client";
import { MSISDN_FORMATS } from "@/lib/data-bundles/mtn/msisdn";
import { toLocalGhPhone } from "@/lib/data-bundles/networks";

/**
 * Saving the Developer tab.
 *
 * Its own action file rather than another branch of `updateDataSettings`,
 * because the two have different jobs and only one of them handles secrets.
 * Keeping them apart means the storefront's save path is not touched at all by
 * any of this — the live console behaves exactly as it did.
 *
 * Two rules shape everything here:
 *
 *   Secrets are write-only. The consumer secret and the SIM's PIN are never
 *   rendered back to a browser, so the form posts them empty when unchanged
 *   and an empty value means "leave it alone" rather than "set it to nothing".
 *   Clearing one is therefore its own explicit checkbox — otherwise there
 *   would be no way to remove a secret at all, and no way to tell the two
 *   intentions apart.
 *
 *   The switch is validated hardest. Everything else can be wrong and merely
 *   not work; `dataRouteMTN` is the one field that changes what happens to a
 *   paying customer's order, so it is refused unless the configuration behind
 *   it is actually complete.
 */

export type DeveloperSettingsState = {
  ok?: boolean;
  error?: string;
  notice?: string;
  fieldErrors?: Record<string, string>;
};

/** Plain text fields: saved as typed, no interpretation. */
const TEXT_KEYS = [
  "mtnApiBase",
  "mtnClientId",
  "mtnSenderMsisdn",
  "mtnTargetSystem",
  "mtnOriginChannelId",
  "mtnCountryCode",
  "mtnNetworkParam",
  "mtnTransferType",
  "mtnAgentId",
  "mtnProductCodes",
] as const;

/** Write-only fields, each with the checkbox that clears it. */
const SECRET_KEYS = ["mtnClientSecret", "mtnSenderPin"] as const;

function str(fd: FormData, key: string): string {
  return String(fd.get(key) ?? "").trim();
}

function checked(fd: FormData, key: string): boolean {
  return fd.get(key) !== null;
}

export async function updateDeveloperSettings(
  _prev: DeveloperSettingsState,
  fd: FormData,
): Promise<DeveloperSettingsState> {
  await requireAdmin();

  const entries: Record<string, string> = {};

  for (const key of TEXT_KEYS) {
    if (fd.has(key)) entries[key] = str(fd, key);
  }

  // A secret arrives empty when it was not retyped — which is the normal case,
  // since the form never shows it. Only an explicit "clear" removes one.
  for (const key of SECRET_KEYS) {
    const typed = String(fd.get(key) ?? ""); // not trimmed: a secret may legitimately contain spaces
    if (checked(fd, `${key}Clear`)) entries[key] = "";
    else if (typed !== "") entries[key] = typed;
  }

  if (fd.has("mtnMsisdnFormat")) {
    const format = str(fd, "mtnMsisdnFormat").toUpperCase();
    if (!(MSISDN_FORMATS as readonly string[]).includes(format)) {
      return {
        error: "Choose a number format MTN understands.",
        fieldErrors: { mtnMsisdnFormat: "Pick one of the two." },
      };
    }
    entries.mtnMsisdnFormat = format;
  }

  if (fd.has("mtnCallbackEnabled")) {
    entries.mtnCallbackEnabled = str(fd, "mtnCallbackEnabled") === "0" ? "0" : "1";
  }

  // The sender line is checked here rather than left to fail at transfer time:
  // a number that is not a Ghana mobile number cannot become an MSISDN, and
  // finding that out on a customer's order is finding it out too late.
  if (entries.mtnSenderMsisdn && !toLocalGhPhone(entries.mtnSenderMsisdn)) {
    return {
      error: "The sender number is not a Ghana mobile number.",
      fieldErrors: { mtnSenderMsisdn: "e.g. 0240719356" },
    };
  }

  if (entries.mtnApiBase && !/^https:\/\//i.test(entries.mtnApiBase)) {
    return {
      error: "The MTN API base URL must start with https://.",
      fieldErrors: { mtnApiBase: "https://api.mtn.com/v1" },
    };
  }

  // --- the switch ----------------------------------------------------------
  // Everything above can be saved half-finished; this cannot. Turning the
  // route on with a gap in the configuration would not break anything — the
  // router falls back to the existing provider — but it would tell an admin
  // the integration is live when it is not, which is worse than refusing.
  let notice: string | undefined;
  if (fd.has("dataRouteMTN")) {
    const route = str(fd, "dataRouteMTN").toUpperCase() === "MTN" ? "MTN" : "JUSTICE";

    if (route === "MTN") {
      // Judge the switch against what is *about* to be stored — the values
      // already saved, with this form's own on top — so a form that fills in
      // the last missing field and flips the switch in one go is not refused
      // for the state things were in before it was submitted.
      //
      // Built from a merged record rather than from a re-read, because a read
      // taken straight after a write is not reliably fresh (see buildMtnConfig)
      // and this is the one check that must not pass on stale values.
      const merged = { ...(await getDataSettings()), ...entries, dataRouteMTN: "MTN" };
      const config = buildMtnConfig(merged);

      if (config.missing.length > 0) {
        return {
          error: `MTN orders stay with the current provider until this is filled in: ${config.missing.join(", ")}.`,
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

  // Credentials may have just changed, so a token minted under the old pair
  // must not be reused — that would show up as an intermittent 401.
  forgetMtnToken();

  updateTag(DATA_SETTINGS_TAG);
  revalidatePath("/admin/data/settings/developer");
  revalidatePath("/admin/data");
  return { ok: true, notice };
}

/**
 * Prove the credentials work without moving anything.
 *
 * A token request authenticates and does nothing else — it cannot transfer
 * data, cannot spend the line's balance, and cannot touch an order. That makes
 * it the one check safe to offer as a button on a live store.
 */
export async function testMtnConnection(
  _prev: DeveloperSettingsState,
  _fd: FormData,
): Promise<DeveloperSettingsState> {
  await requireAdmin();

  const config = await getMtnConfig();
  if (!config.clientId || !config.clientSecret) {
    return { error: "Enter the consumer key and secret first, and save." };
  }

  const res = await testMtnCredentials(config);
  if (!res.ok) return { error: res.message };

  const outstanding = config.missing.filter((m) => !m.startsWith("Consumer"));
  return {
    ok: true,
    notice: outstanding.length
      ? `MTN accepted the credentials. Still needed before orders can route: ${outstanding.join(", ")}.`
      : "MTN accepted the credentials.",
  };
}
