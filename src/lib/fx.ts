import "server-only";
import { prisma } from "@/lib/prisma";
import { HOME_CURRENCY } from "@/lib/shipping";

/**
 * Exchange rates, fetched rather than typed.
 *
 * A forwarder quotes $280 per cubic metre and the buyer pays cedis, so one
 * number decides what every imported listing on the platform costs. It used to
 * be a number somebody typed into a form, which meant it was correct on the day
 * it was typed and silently wrong every day after — and nothing on any screen
 * said which of those two you were looking at.
 *
 * So the rates are pulled from a public reference and re-pulled on a schedule.
 * Three rules keep an outside service from doing damage:
 *
 *   1. **A currency can opt out.** `autoUpdate = false` pins it by hand, for a
 *      rate somebody has a reason to hold — a contracted rate, or a currency
 *      the provider quotes badly.
 *   2. **Nothing implausible is written.** A zero, a negative, a missing code
 *      or a figure that has moved by more than half is skipped, not stored. A
 *      provider having a bad morning must not re-price the catalogue.
 *   3. **A failure changes nothing.** The old rates stand. Being a day stale is
 *      an inconvenience; being wrong by a factor of a thousand is a refund.
 */

/**
 * Where the figures come from.
 *
 * `open.er-api.com` publishes daily reference rates for GHS and needs no key,
 * which matters: an API key is a thing that expires unnoticed, and the failure
 * mode of a silently expired key here is a catalogue priced one-for-one.
 */
const PROVIDER = "https://open.er-api.com/v6/latest/GHS";

/** The provider's own host, recorded on each row it writes. */
const PROVIDER_NAME = "open.er-api.com";

/** Give up rather than hold a build or a cron open. */
const TIMEOUT_MS = 8000;

/**
 * A move this large is not the cedi moving; it is a provider misquoting.
 *
 * Half and double. Real currencies do not do that overnight, and a rate that
 * did would re-price every listing quoted in it before anybody noticed.
 */
const MAX_MOVE = 2;

export interface RateRefresh {
  ok: boolean;
  /** Codes whose stored rate was replaced. */
  updated: string[];
  /** Codes the provider covered but that were left alone, and why. */
  skipped: { code: string; reason: string }[];
  error?: string;
  checkedAt: Date;
}

/**
 * What one unit of each currency is worth in GH₵, from the provider.
 *
 * The provider is asked for rates *from* cedis — "1 GHS buys 0.083 USD" — so
 * each figure is inverted to get the direction the platform stores, which is
 * the direction a forwarder's quote has to be converted in.
 */
async function fetchRatesToGhs(): Promise<Record<string, number>> {
  const response = await fetch(PROVIDER, {
    // Rates are re-fetched on a schedule; a cached response would make the
    // schedule a lie.
    cache: "no-store",
    signal: AbortSignal.timeout(TIMEOUT_MS),
    headers: { accept: "application/json" },
  });
  if (!response.ok) throw new Error(`the rates service answered ${response.status}`);

  const body: unknown = await response.json();
  const rates =
    body && typeof body === "object" && "rates" in body
      ? (body as { rates?: unknown }).rates
      : null;
  if (!rates || typeof rates !== "object") throw new Error("the rates service sent no rates");

  const out: Record<string, number> = {};
  for (const [code, value] of Object.entries(rates as Record<string, unknown>)) {
    const perGhs = typeof value === "number" ? value : Number(value);
    // "1 GHS buys 0.083 USD" inverts to "1 USD is worth 12.05 GHS".
    if (Number.isFinite(perGhs) && perGhs > 0) out[code.toUpperCase()] = 1 / perGhs;
  }
  return out;
}

/** Round to four decimals — finer than any rate is meaningful, coarse enough to compare. */
function round(n: number): number {
  return Math.round(n * 10_000) / 10_000;
}

/**
 * Refresh every currency the platform holds and the provider covers.
 *
 * Only rows already in the table are touched. The list of currencies the
 * platform deals in is an admin's decision, not a provider's, and pulling in
 * every code on earth would bury the four that matter.
 */
export async function refreshCurrencyRates(): Promise<RateRefresh> {
  const checkedAt = new Date();
  const updated: string[] = [];
  const skipped: { code: string; reason: string }[] = [];

  let rates: Record<string, number>;
  try {
    rates = await fetchRatesToGhs();
  } catch (error) {
    return {
      ok: false,
      updated,
      skipped,
      checkedAt,
      error: error instanceof Error ? error.message : "the rates service could not be reached",
    };
  }

  let rows;
  try {
    rows = await prisma.currency.findMany();
  } catch {
    return { ok: false, updated, skipped, checkedAt, error: "the currency table is unreachable" };
  }

  for (const row of rows) {
    const code = row.code.toUpperCase();
    // The home currency is one-for-one by definition, and a provider that
    // disagreed would be re-pricing cedis in cedis.
    if (code === HOME_CURRENCY) continue;
    if (!row.autoUpdate) {
      skipped.push({ code, reason: "pinned by hand" });
      continue;
    }

    const fetched = rates[code];
    if (!fetched || !Number.isFinite(fetched) || fetched <= 0) {
      skipped.push({ code, reason: "not quoted by the rates service" });
      continue;
    }

    const next = round(fetched);
    const current = row.rateToGhs;
    // A first fetch against a seeded placeholder is allowed to move freely;
    // after that, an implausible jump is the provider's problem, not ours.
    if (row.source && current > 0) {
      const ratio = next / current;
      if (ratio > MAX_MOVE || ratio < 1 / MAX_MOVE) {
        skipped.push({ code, reason: `moved from ${current} to ${next} — left alone` });
        continue;
      }
    }
    if (next === current && row.source === PROVIDER_NAME) continue;

    try {
      await prisma.currency.update({
        where: { code: row.code },
        data: { rateToGhs: next, source: PROVIDER_NAME },
      });
      updated.push(code);
    } catch {
      skipped.push({ code, reason: "could not be saved" });
    }
  }

  return { ok: true, updated, skipped, checkedAt };
}

/**
 * How stale the rates are, for the screen that shows them.
 *
 * The most recent update across every auto-updated currency: they are written
 * in one pass, so the newest is when the pass last succeeded.
 */
export async function lastRateRefresh(): Promise<Date | null> {
  try {
    const row = await prisma.currency.findFirst({
      where: { source: { not: "" } },
      orderBy: { updatedAt: "desc" },
      select: { updatedAt: true },
    });
    return row?.updatedAt ?? null;
  } catch {
    return null;
  }
}
