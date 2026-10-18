import "server-only";
import { prisma } from "@/lib/prisma";
import { dataDb } from "@/lib/data-db";
import { normaliseInviteSlug } from "@/lib/data-bundles/invite-rules";

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
