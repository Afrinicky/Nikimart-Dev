import "server-only";
import { dataDb } from "@/lib/data-db";
import {
  isDataProviderConfigured,
  isProviderDashboardConfigured,
  listProviderPackages,
  priceSourceLabel,
  type PriceSource,
} from "@/lib/data-bundles/provider";
import { parsePackages, planCostUpdates, type CostChange } from "@/lib/data-bundles/package-prices";

/**
 * Keeping the cost price honest, without anybody retyping it.
 *
 * Cost is what every other number on the bundle store is derived from — the
 * margin on a retail sale, the margin on an agent sale, the guard that refuses
 * to sell to agents below cost. It was a hand-typed column, so it was correct
 * on the day somebody typed it and silently wrong from the next price change
 * onwards; and it goes wrong in one direction, because a provider's price
 * rising while ours stands still is a bundle sold at a loss on every order.
 *
 * So it is read from the provider instead, once a day on the existing sweep and
 * on demand from the price screen. Nothing else is touched: retail prices,
 * agent prices and what is on sale stay exactly as the admin set them. This
 * only ever writes `costPrice`.
 *
 * Where the list comes from is the caller's choice — the order-taking API key,
 * the dashboard sign-in, or whichever of the two answers. See `PriceSource` in
 * lib/data-bundles/provider.
 */

export interface CostSyncResult {
  ok: boolean;
  /** Bundles whose cost moved and was written. */
  updated: number;
  /** Bundles we sell that the provider didn't list. */
  unmatched: number;
  /** How many packages the provider listed at all. */
  listed: number;
  /** What moved, for the line the admin screen shows. */
  changes: CostChange[];
  /** Which read answered, so a failing half can be told from a working one. */
  source: "api" | "dashboard" | null;
  message: string;
}

function summarise(changes: CostChange[], unmatched: number): string {
  if (changes.length === 0) {
    return unmatched > 0
      ? `Costs are already up to date. ${unmatched} ${unmatched === 1 ? "bundle isn't" : "bundles aren't"} listed by the provider.`
      : "Costs are already up to date.";
  }
  const rose = changes.filter((c) => c.to > c.from).length;
  const fell = changes.length - rose;
  const parts: string[] = [];
  if (rose > 0) parts.push(`${rose} up`);
  if (fell > 0) parts.push(`${fell} down`);
  return `Updated ${changes.length} cost ${changes.length === 1 ? "price" : "prices"} (${parts.join(", ")}).`;
}

/** Whether the credentials one source needs are actually present. */
export function isPriceSourceConfigured(source: PriceSource): boolean {
  if (source === "api") return isDataProviderConfigured();
  if (source === "dashboard") return isProviderDashboardConfigured();
  return isDataProviderConfigured() || isProviderDashboardConfigured();
}

function missingCredentialsMessage(source: PriceSource): string {
  if (source === "api") {
    return "No provider API key, so costs can't be fetched. Set JUSTICE_API_KEY.";
  }
  if (source === "dashboard") {
    return (
      "Provider sign-in isn't configured, so costs can't be fetched. " +
      "Set JUSTICE_AGENT_PHONE and JUSTICE_AGENT_PASSWORD to the dashboard login."
    );
  }
  return (
    "Nothing is configured to read prices with. Set JUSTICE_API_KEY, or " +
    "JUSTICE_AGENT_PHONE and JUSTICE_AGENT_PASSWORD for the dashboard login."
  );
}

/**
 * Pull the provider's price list and write back any cost that has moved.
 *
 * Never throws: this runs unattended on the daily sweep, where a provider
 * outage must not take the rest of the sweep down with it. A failure leaves
 * every cost exactly as it was — yesterday's number is much better than a zero.
 */
export async function syncBundleCosts(
  opts: { source?: PriceSource } = {},
): Promise<CostSyncResult> {
  const empty: CostSyncResult = {
    ok: false,
    updated: 0,
    unmatched: 0,
    listed: 0,
    changes: [],
    source: null,
    message: "",
  };

  const source = opts.source ?? "auto";
  if (!isPriceSourceConfigured(source)) {
    return { ...empty, message: missingCredentialsMessage(source) };
  }

  const listing = await listProviderPackages(source);
  if (!listing.ok || !listing.payload) {
    return { ...empty, source: listing.source, message: listing.message };
  }

  const packages = parsePackages(listing.payload);
  if (packages.length === 0) {
    return {
      ...empty,
      listed: 0,
      source: listing.source,
      message: "The provider listed no packages we could read. Costs are unchanged.",
    };
  }

  let bundles;
  try {
    bundles = await dataDb.dataBundle.findMany({
      select: { id: true, network: true, sizeGb: true, costPrice: true },
    });
  } catch {
    return {
      ...empty,
      source: listing.source,
      message: "Couldn't read the bundle ladder — is the database migrated?",
    };
  }

  const plan = planCostUpdates(bundles, packages);

  // One write per bundle that moved, in a single transaction: a half-applied
  // sync would leave the ladder priced against two different days.
  if (plan.changes.length > 0) {
    try {
      await dataDb.$transaction(
        plan.changes.map((change) =>
          dataDb.dataBundle.update({
            where: { id: change.id },
            data: { costPrice: change.to },
          }),
        ),
      );
    } catch {
      return {
        ...empty,
        listed: packages.length,
        source: listing.source,
        message: "Couldn't save the new cost prices.",
      };
    }
  }

  return {
    ok: true,
    updated: plan.changes.length,
    unmatched: plan.unmatched.length,
    listed: packages.length,
    changes: plan.changes,
    source: listing.source,
    message: `${summarise(plan.changes, plan.unmatched.length)} Read from ${priceSourceLabel(listing.source)}.`,
  };
}
