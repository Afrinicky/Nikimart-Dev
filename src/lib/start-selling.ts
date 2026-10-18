import "server-only";
import { getSettings } from "@/lib/settings";
import { getAffiliatePolicy } from "@/lib/affiliate-settings";
import { getAgentProgramConfig } from "@/lib/data-bundles/settings";

/**
 * What it costs to join through the Start Selling page.
 *
 * Each of the three programmes already has a price of its own, set in its own
 * console: a shop's in Settings, the bundle storefront's in the agent console,
 * an affiliate's in theirs. Those are what somebody pays however they arrive —
 * a recruiter's link, a direct registration, an admin invitation.
 *
 * This is the one door the adverts point at, and a door you are paying to send
 * people through is worth being able to price separately: a campaign fee, a
 * launch offer, free for a week. So each programme can name a second price for
 * that door, which applies only to a registration that came through it.
 *
 * Each price is set where that programme is run — a shop's in Settings, the
 * bundle storefront's in the agent console, an affiliate's in theirs — because
 * that is where somebody goes to change what joining costs. This module only
 * gathers the three.
 *
 * Blank means "whatever that programme charges anyway", so nobody has to set
 * three numbers to use one of them. Zero is a real price — free through this
 * page — which is exactly the thing an empty box could not say.
 */

/** How somebody reached a registration form. */
export type JoinChannel = "default" | "start-selling";

/** The query parameter the Start Selling page's links carry. */
export const CHANNEL_PARAM = "via";
export const START_SELLING_CHANNEL = "start-selling";

/**
 * Read a channel off a URL or a form field.
 *
 * Anything unrecognised is the ordinary channel, because a channel decides a
 * price and an unknown one must never be read as "some other price".
 */
export function joinChannel(raw: string | null | undefined): JoinChannel {
  return (raw ?? "").trim().toLowerCase() === START_SELLING_CHANNEL
    ? START_SELLING_CHANNEL
    : "default";
}

/** Append the channel to a link, for the page's own three cards. */
export function withChannel(href: string, channel: JoinChannel): string {
  if (channel === "default") return href;
  return `${href}${href.includes("?") ? "&" : "?"}${CHANNEL_PARAM}=${START_SELLING_CHANNEL}`;
}

/** Which programme a price belongs to. */
export type JoinKind = "shop" | "agent" | "affiliate";

export interface StartSellingFees {
  /** Null means "whatever that programme charges anyway". */
  shop: number | null;
  agent: number | null;
  affiliate: number | null;
}

export const NO_START_SELLING_FEES: StartSellingFees = {
  shop: null,
  agent: null,
  affiliate: null,
};

/** A stored amount, where blank is genuinely different from zero. */
function amount(raw: string | undefined): number | null {
  const value = (raw ?? "").trim();
  if (value === "") return null;
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0) return null;
  return Math.round(n * 100) / 100;
}

/** The three, each read from the console that owns it. */
export async function getStartSellingFees(): Promise<StartSellingFees> {
  const [raw, program, policy] = await Promise.all([
    getSettings(),
    getAgentProgramConfig(),
    getAffiliatePolicy(),
  ]);
  return {
    shop: amount((raw as unknown as Record<string, string>).startSellingShopFee),
    agent: program.startSellingFee,
    affiliate: policy.startSellingFee,
  };
}

/**
 * The price one programme charges somebody arriving on this channel.
 *
 * `normal` is what that programme charges anyone else, and it is what comes
 * back unless the page's prices are switched on and that one is set.
 */
export function feeForChannel(
  kind: JoinKind,
  channel: JoinChannel,
  normal: number,
  fees: StartSellingFees,
): number {
  if (channel !== START_SELLING_CHANNEL) return normal;
  const own = fees[kind];
  return own === null ? normal : own;
}

/** The same, for a caller that has not already read the settings. */
export async function channelFee(
  kind: JoinKind,
  channel: JoinChannel,
  normal: number,
): Promise<number> {
  if (channel !== START_SELLING_CHANNEL) return normal;
  return feeForChannel(kind, channel, normal, await getStartSellingFees());
}
