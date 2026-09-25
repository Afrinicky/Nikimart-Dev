// Relative, with the extension: this module is pulled in by a *.test.ts run
// through Node's type stripping, which resolves neither the "@/…" alias nor a
// missing extension (the same reason lib/payment-routing does it this way).
import { clampPercent } from "./referral-rules.ts";

/**
 * When an admin-issued registration link may still be used.
 *
 * Pure, and tested, because every one of these conditions is a way to give a
 * discount away by accident: a link that outlives the campaign it was made for,
 * one shared publicly and used two hundred times, one switched off that keeps
 * working. The link is a price, so the rules that retire it are worth the same
 * care as the rules that set it.
 */

export interface InviteLike {
  waiverPercent: number;
  maxUses: number;
  usedCount: number;
  expiresAt: Date | null;
  isActive: boolean;
}

export type InviteProblem = "inactive" | "expired" | "used-up";

/** Why this link can't be used, or null when it can. */
export function inviteProblem(invite: InviteLike, now: Date = new Date()): InviteProblem | null {
  if (!invite.isActive) return "inactive";
  if (invite.expiresAt && invite.expiresAt.getTime() <= now.getTime()) return "expired";
  // 0 means unlimited, which is the default: a link with no cap is the normal
  // case, and a cap of zero uses would be a link that never worked.
  if (invite.maxUses > 0 && invite.usedCount >= invite.maxUses) return "used-up";
  return null;
}

export function inviteUsable(invite: InviteLike, now: Date = new Date()): boolean {
  return inviteProblem(invite, now) === null;
}

/** What to tell somebody holding a link that no longer works. */
export function inviteProblemMessage(problem: InviteProblem): string {
  switch (problem) {
    case "expired":
      return "That registration link has expired. You can still register at the normal fee.";
    case "used-up":
      return "That registration link has already been used the maximum number of times. You can still register at the normal fee.";
    default:
      return "That registration link is no longer active. You can still register at the normal fee.";
  }
}

/** The discount a usable link grants; anything else grants nothing. */
export function inviteWaiverPercent(
  invite: InviteLike | null | undefined,
  now: Date = new Date(),
): number {
  if (!invite || !inviteUsable(invite, now)) return 0;
  return clampPercent(invite.waiverPercent);
}

/** How the discount reads on the signup form. */
export function inviteWaiverLabel(waiverPercent: number): string {
  const percent = clampPercent(waiverPercent);
  if (percent >= 100) return "Your registration fee is waived in full.";
  if (percent <= 0) return "";
  return `${percent % 1 === 0 ? percent : percent.toFixed(1)}% off your registration fee.`;
}

/**
 * Codes people read off a screen and type into a phone.
 *
 * No 0/O/1/I/L: the pairs that get transcribed wrong, on a code whose whole job
 * is to survive being written on a flyer and typed back in.
 */
const CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";

export function newInviteCode(random: () => number = Math.random): string {
  let out = "";
  for (let i = 0; i < 8; i++) {
    out += CODE_ALPHABET[Math.floor(random() * CODE_ALPHABET.length)];
  }
  return out;
}

/** Normalise whatever arrives in the URL or a form field. */
export function normaliseInviteCode(value: string | null | undefined): string {
  return (value ?? "").trim().toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 16);
}

// ---------------------------------------------------------------------------
// Short paths.
//
// A link an advert can carry. `/become-an-agent?invite=ABCD2345` is refused by
// Facebook's and WhatsApp's link checks — a query string on an unfamiliar
// domain is what a tracking redirect looks like — so a link meant for an advert
// gets a bare path instead: nickimart.com/join.
//
// The path is the whole point of the link, so the rules that decide whether one
// may be claimed are here, pure and tested, rather than inside the form.
// ---------------------------------------------------------------------------

/**
 * Paths that are already the app's own, and so cannot be a short path.
 *
 * Next.js resolves a static segment before a dynamic one, so a link claiming
 * "login" would never be reached rather than shadowing the sign-in page: this
 * list exists to say so at the moment it is created, instead of leaving an
 * admin with a link that silently goes somewhere else.
 *
 * Kept in step with the top level of src/app by hand. A name missing from here
 * costs a dead link, which is why the check is repeated as a route-level guard
 * rather than trusted from this list alone.
 */
export const RESERVED_INVITE_SLUGS: readonly string[] = [
  // Top-level routes.
  "account", "admin", "affiliate", "agent", "agent-setup", "api",
  "become-an-agent", "brand", "buy-for-me", "buyer-protection", "campus",
  "cart", "categories", "checkout", "data-bundles", "forgot-password",
  "freight", "global-shopping", "help", "how-it-works", "legal", "login",
  "order-tracking", "orders", "pages", "pickup", "pickup-points", "preorders",
  "products", "register", "reset-password", "sell", "seller", "services",
  "shipped-from-abroad", "shops", "start-selling", "store", "vendor-register",
  // Paths next.config.ts redirects.
  "databundles",
  // Framework and asset paths, and the metadata routes the app generates.
  "_next", "_vercel", "static", "public", "assets", "images", "uploads",
  "favicon.ico", "icon", "icon.svg", "apple-icon", "apple-icon.png",
  "manifest.json", "manifest.webmanifest", "opengraph-image", "twitter-image",
  "robots.txt", "sitemap.xml",
];

const RESERVED = new Set(RESERVED_INVITE_SLUGS);

/**
 * Normalise a short path, from a form field or from the URL.
 *
 * Lowercase, because a path typed into a phone browser is whatever case the
 * keyboard felt like and `/Join` and `/join` have to be the same link.
 */
export function normaliseInviteSlug(value: string | null | undefined): string {
  return (value ?? "")
    .trim()
    .toLowerCase()
    // A whole URL pasted in rather than a path: keep the last segment.
    .replace(/^https?:\/\/[^/]+/, "")
    .replace(/^\/+|\/+$/g, "")
    .replace(/[^a-z0-9-]/g, "-")
    .replace(/-{2,}/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 32);
}

/** Why this short path can't be used, or null when it can. */
export function inviteSlugProblem(slug: string): string | null {
  if (slug.length < 2) return "A short path needs at least two characters — try “join”.";
  if (RESERVED.has(slug)) {
    return `nickimart.com/${slug} is already a page on the site. Pick another word.`;
  }
  return null;
}

/** Is this path the app's own, whatever an admin may once have claimed? */
export function isReservedInviteSlug(slug: string): boolean {
  return RESERVED.has(slug);
}

/** The advert-friendly link for a short path. */
export function inviteSlugUrl(origin: string, slug: string): string {
  return `${origin.replace(/\/+$/, "")}/${slug}`;
}
