import "server-only";
import { medicalDb, readMedical } from "@/lib/medical/db";

/**
 * Settings: the handful of decisions the business makes once.
 *
 * Stored as rows rather than in a config file because they are the business's
 * to change, not a developer's — and typed, because `"false"` is a true string
 * and a setting read as a string where a boolean was meant is the kind of bug
 * that turns a tax line on.
 *
 * Deliberately small. A setting for everything is how a system ends up with
 * four hundred of them and no behaviour anybody can predict, so anything that
 * is really a rule lives in code where it can be tested — `roles.ts`,
 * `purchase-mode.ts`, the landed-cost module. What is here is the business's
 * own name, its documents' defaults, and the two switches
 * `docs/medical/REGULATORY.md` keeps off.
 */

export type SettingValue = string | number | boolean | unknown;

export interface SettingRow {
  key: string;
  value: string;
  valueType: string;
  group: string;
  label: string;
  helpText: string;
  updatedAt: Date;
  updatedById: string;
}

/** Every setting, grouped, in the order the groups are presented. */
export const SETTING_GROUPS = [
  { key: "general", label: "Business", blurb: "What the business is called on its own documents." },
  {
    key: "quotations",
    label: "Quotations",
    blurb: "Defaults a new quotation starts from. Each one can be overridden when it is issued.",
  },
  {
    key: "finance",
    label: "Finance",
    blurb: "Two of these are held off deliberately — see the note under each.",
  },
  { key: "inventory", label: "Inventory", blurb: "When the storefront starts saying low stock." },
  { key: "redistributors", label: "Redistributors", blurb: "The fallback commission rate." },
] as const;

export async function listSettings(): Promise<SettingRow[]> {
  return readMedical(
    () => medicalDb.medicalSetting.findMany({ orderBy: [{ group: "asc" }, { key: "asc" }] }),
    [],
  );
}

/**
 * One setting, parsed to the type it declares.
 *
 * Returns the fallback when the row is missing, when the medical database is
 * not configured, or when the stored text cannot be read as the declared type.
 * It never throws: a malformed setting must not take a page down, and the
 * fallback is always the safe reading — `tax.enabled` defaults to off.
 */
export async function setting<T>(key: string, fallback: T): Promise<T> {
  const row = await readMedical(
    () => medicalDb.medicalSetting.findUnique({ where: { key } }),
    null,
  );
  if (!row) return fallback;
  return parseSetting(row.value, row.valueType, fallback);
}

export function parseSetting<T>(value: string, valueType: string, fallback: T): T {
  try {
    switch (valueType) {
      case "number": {
        const n = Number(value);
        return (Number.isFinite(n) ? n : fallback) as T;
      }
      case "boolean":
        // Only an explicit "true" is true. Anything else — "", "0", "no", a
        // typo — reads as off, because the two booleans here are switches that
        // must stay off until somebody deliberately turns them on.
        return (value.trim().toLowerCase() === "true") as T;
      case "json":
        return JSON.parse(value) as T;
      default:
        return value as T;
    }
  } catch {
    return fallback;
  }
}

/**
 * Whether a stored value is readable as the type it claims.
 *
 * Used by the settings form to refuse a bad value on the way in rather than
 * discovering it on the way out, where the fallback would silently stand in for
 * what somebody thought they had saved.
 */
export function validateSetting(value: string, valueType: string): string | null {
  switch (valueType) {
    case "number":
      return Number.isFinite(Number(value.trim())) ? null : "Enter a number.";
    case "boolean":
      return ["true", "false"].includes(value.trim().toLowerCase())
        ? null
        : "Choose on or off.";
    case "json":
      try {
        JSON.parse(value);
        return null;
      } catch {
        return "That is not valid JSON.";
      }
    default:
      return null;
  }
}
