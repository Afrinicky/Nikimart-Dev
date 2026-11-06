import { unstable_cache } from "next/cache";
import { prisma } from "@/lib/prisma";
import { CACHE_BACKSTOP_LONG } from "@/lib/cache-windows";
import { VENDORS_TAG } from "@/lib/catalog";

export const runtime = "nodejs";

/** A 1×1 transparent PNG, for a shop with no branding set. */
const BLANK = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==",
  "base64",
);

/**
 * A shop's logo or cover banner, as an image rather than as markup.
 *
 * `/brand/logo` and `/img/product/[id]` for the same reason: the branding
 * fields accept a `data:` URL, so the value can be a whole picture, and a page
 * that printed it inline carried the picture in its markup — and again in the
 * Flight payload wherever a client component received it.
 *
 * The URL carries a digest of the bytes, so it is cached immutably for a year
 * and new branding is simply a new URL.
 */
const readVendorImage = unstable_cache(
  async (vendorId: string, kind: "logo" | "banner"): Promise<string | null> => {
    const row = await prisma.vendor.findUnique({
      where: { id: vendorId },
      select: { logoUrl: true, bannerUrl: true },
    });
    if (!row) return null;
    return (kind === "banner" ? row.bannerUrl : row.logoUrl) || null;
  },
  ["vendor-image-bytes"],
  { tags: [VENDORS_TAG], revalidate: CACHE_BACKSTOP_LONG },
);

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const url = new URL(request.url);
  const kind = url.searchParams.get("k") === "banner" ? "banner" : "logo";

  const stored = (await readVendorImage(id, kind).catch(() => null))?.trim() ?? "";
  const match = /^data:(image\/[a-z.+-]+);base64,(.+)$/i.exec(stored);

  if (!match && /^https?:\/\//i.test(stored)) return Response.redirect(stored, 308);

  const body = match ? Buffer.from(match[2], "base64") : BLANK;
  const type = match ? match[1] : "image/png";
  const versioned = url.searchParams.has("v");

  return new Response(new Uint8Array(body), {
    headers: {
      "Content-Type": type,
      "Content-Length": String(body.length),
      "Cache-Control": versioned
        ? "public, max-age=31536000, immutable"
        : "public, max-age=0, s-maxage=86400, must-revalidate",
    },
  });
}
