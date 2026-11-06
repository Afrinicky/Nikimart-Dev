import "server-only";
import { prisma } from "@/lib/prisma";

/**
 * A shop's logo and cover banner, as links — without reading either image.
 *
 * The same problem `product-image-stamps.ts` describes, in the place it is
 * least obvious. `getVendorNameMap()` is called by every catalogue page, and
 * it was built from `getVendors()`, which was a `findMany` with no `select` at
 * all: every column of every shop, including two branding images that may each
 * be a whole picture as base64 — and, incidentally, every shop's momo and bank
 * account details, which no storefront page has any business reading.
 *
 * So a page that wanted a map of shop ids to shop names read the lot, on every
 * request, into a cache entry too large to be stored. What comes back now is
 * the columns a storefront actually renders, plus a digest per image.
 */

export type VendorImageStamps = {
  logo: { short: string; fingerprint: string } | null;
  banner: { short: string; fingerprint: string } | null;
};

type Row = {
  id: string;
  logoShort: string;
  logoFingerprint: string;
  bannerShort: string;
  bannerFingerprint: string;
};

/** The link a page should use for one of a shop's images. */
export function servedVendorImage(
  vendorId: string,
  kind: "logo" | "banner",
  stamp: { short: string; fingerprint: string } | null | undefined,
): string {
  if (!stamp) return "";
  // Already a URL somebody can fetch — leave it exactly as the shop set it.
  if (stamp.short) return stamp.short;
  if (!stamp.fingerprint) return "";
  return `/img/vendor/${vendorId}?k=${kind}&v=${stamp.fingerprint}`;
}

export async function readVendorImageStamps(): Promise<Map<string, VendorImageStamps>> {
  const byVendor = new Map<string, VendorImageStamps>();
  try {
    const rows = await prisma.$queryRaw<Row[]>`
      SELECT "id",
             CASE WHEN length("logoUrl") <= 512 THEN "logoUrl" ELSE '' END AS "logoShort",
             md5("logoUrl") AS "logoFingerprint",
             CASE WHEN length("bannerUrl") <= 512 THEN "bannerUrl" ELSE '' END AS "bannerShort",
             md5("bannerUrl") AS "bannerFingerprint"
      FROM "Vendor"
    `;
    for (const row of rows) {
      byVendor.set(row.id, {
        logo: { short: row.logoShort, fingerprint: row.logoFingerprint },
        banner: { short: row.bannerShort, fingerprint: row.bannerFingerprint },
      });
    }
  } catch {
    // A shop with no branding renders its initials badge, which is the same
    // thing this failing produces. Nothing to report.
    return byVendor;
  }
  return byVendor;
}
