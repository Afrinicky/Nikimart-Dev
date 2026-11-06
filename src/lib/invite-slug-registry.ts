import "server-only";
import { cache } from "react";
import { unstable_cache, updateTag } from "next/cache";
import { prisma } from "@/lib/prisma";
import { dataDb } from "@/lib/data-db";
import { CACHE_BACKSTOP } from "@/lib/cache-windows";
import {
  isReservedInviteSlug,
  normaliseInviteSlug,
} from "@/lib/data-bundles/invite-rules";

/**
 * Who owns a short path.
 *
 * Both programmes issue registration links with an advert-friendly path —
 * nickimart.com/join, nickimart.com/earn — and both are matched by the one
 * root route a single-segment path can be matched by. Two links in different
 * tables could therefore claim the same word, and the route would have to
 * prefer one of them, which would quietly point an advert somewhere its admin
 * never chose.
 *
 * So a path belongs to one programme or the other, and the console says which
 * at the moment the clash happens rather than leaving somebody to discover it
 * from the wrong page loading.
 */

export type SlugOwner = "agent" | "affiliate";

export const OWNER_LABELS: Record<SlugOwner, string> = {
  agent: "a data bundle registration link",
  affiliate: "an affiliate registration link",
};

/**
 * Is this path already held by the *other* programme?
 *
 * Within one programme a repeated path re-points the old link, which is a
 * decision an admin can make for their own links. Across programmes it is not
 * theirs to make on the other console's behalf, so this returns who holds it
 * and the caller refuses.
 */
export async function slugHeldElsewhere(
  rawSlug: string,
  mine: SlugOwner,
): Promise<SlugOwner | null> {
  const slug = normaliseInviteSlug(rawSlug);
  if (!slug) return null;

  if (mine !== "agent") {
    const agent = await dataDb.dataAgentInvite
      .findUnique({ where: { slug }, select: { id: true } })
      .catch(() => null);
    if (agent) return "agent";
  }
  if (mine !== "affiliate") {
    const affiliate = await prisma.affiliateInvite
      .findUnique({ where: { slug }, select: { id: true } })
      .catch(() => null);
    if (affiliate) return "affiliate";
  }
  return null;
}

/**
 * Every short path either programme has claimed, as a set.
 *
 * Why this exists
 * ---------------
 * `src/app/[inviteSlug]/page.tsx` is a dynamic segment at the *root*, so it
 * catches every single-segment path the site does not otherwise answer. That
 * is not mostly people mistyping an address. A public domain is scanned
 * continuously for `/wp-login.php`, `/.env`, `/.git`, `/config`, `/backup`
 * and a few hundred others, and `normaliseInviteSlug` turns each of them into
 * a perfectly ordinary-looking word the reserved list has never heard of.
 *
 * Each of those probes used to cost two `findUnique` queries against two
 * different databases — once in `generateMetadata` and, for a path that
 * resolved, again in the page — followed by a full render of the not-found
 * page inside the whole site chrome. Nothing about that was cached, because
 * the route is `force-dynamic` and the lookups take the path as their key, so
 * the work scaled with the number of strangers guessing rather than with the
 * number of links we have actually issued.
 *
 * A shop issues a handful of these links, so the complete answer is a few
 * dozen short strings. Reading it once per cache window and checking
 * membership costs nothing, and an unclaimed path is then refused without
 * touching a database at all.
 *
 * Tagged, and dropped by every write below, so a link an admin creates works
 * on the next request rather than when the window lapses.
 */
export const INVITE_SLUGS_TAG = "invite-slugs";

const readClaimedSlugs = unstable_cache(
  async (): Promise<string[]> => {
    const [agents, affiliates] = await Promise.all([
      dataDb.dataAgentInvite
        .findMany({ where: { slug: { not: null } }, select: { slug: true } })
        .catch(() => [] as { slug: string | null }[]),
      prisma.affiliateInvite
        .findMany({ where: { slug: { not: null } }, select: { slug: true } })
        .catch(() => [] as { slug: string | null }[]),
    ]);
    return [...agents, ...affiliates]
      .map((row) => row.slug)
      .filter((slug): slug is string => Boolean(slug));
  },
  ["invite-slugs"],
  { tags: [INVITE_SLUGS_TAG], revalidate: CACHE_BACKSTOP },
);

/**
 * Could this path belong to a registration link at all?
 *
 * False is the answer for every scanner probe and every mistyped address, and
 * it is reached without a query. True means it is worth looking the path up
 * properly — which is what the route then does, because the set may be up to
 * one cache window stale on a link that was just switched off.
 *
 * `cache` wraps it so `generateMetadata` and the page body share one answer
 * within a request instead of asking twice.
 */
export const isClaimedInviteSlug = cache(async (rawSlug: string): Promise<boolean> => {
  const slug = normaliseInviteSlug(rawSlug);
  if (!slug || isReservedInviteSlug(slug)) return false;
  try {
    return (await readClaimedSlugs()).includes(slug);
  } catch {
    // Never let a cache miss turn a live link into a 404: if we cannot tell,
    // let the route ask the database the slow way.
    return true;
  }
});

/** Drop the set. Called by every write that creates, renames or removes a link. */
export function forgetClaimedInviteSlugs(): void {
  try {
    updateTag(INVITE_SLUGS_TAG);
  } catch {
    // Called outside a request (a script, a seed) — nothing to drop.
  }
}
