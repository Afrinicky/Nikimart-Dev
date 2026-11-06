import sharp from "sharp";
import { prisma } from "@/lib/prisma";
import { readProductImageBytes } from "@/lib/product-image-bytes";
import { computeSettingsOrDefaults } from "@/lib/compute-settings";

// Needs Prisma + sharp, so run on Node. Output a small JPEG (not a heavy PNG):
// WhatsApp and other scrapers silently drop preview images that are too large,
// so we compress the actual product photo well under their limit.
export const runtime = "nodejs";
// A day. Without it this route re-renders — decode, resize, re-encode — for
// every scraper that asks, and a product's card does not change between asks.
// The `Cache-Control` below covers the CDN; this covers the route itself.
export const revalidate = 86400;
export const size = { width: 1200, height: 630 };
export const contentType = "image/jpeg";
export const alt = "Nickimart product";

// Nickimart navy — fills the letterbox bars around non-landscape photos.
const BG = { r: 14, g: 31, b: 54, alpha: 1 };

async function blankCard(): Promise<Buffer> {
  return sharp({ create: { width: 1200, height: 630, channels: 3, background: BG } }).jpeg({ quality: 80 }).toBuffer();
}

/** The stored photograph as bytes, without going back out over the network. */
async function loadBuffer(slug: string): Promise<Buffer | null> {
  try {
    const row = await prisma.product.findUnique({ where: { slug }, select: { id: true } });
    if (!row) return null;
    const stored = (await readProductImageBytes(row.id, 0))?.trim() ?? "";
    const match = /^data:image\/[a-z.+-]+;base64,(.+)$/i.exec(stored);
    if (match) return Buffer.from(match[1], "base64");
    if (/^https?:\/\//i.test(stored)) {
      const res = await fetch(stored, { signal: AbortSignal.timeout(5000) });
      if (!res.ok) return null;
      const ab = await res.arrayBuffer();
      if (ab.byteLength > 15_000_000) return null;
      return Buffer.from(ab);
    }
    return null;
  } catch {
    return null;
  }
}

export default async function ProductOgImage({ params }: { params: Promise<{ slug: string }> }) {
  // Settings → Performance. Two switches reach here: the first turns
  // link-preview cards off altogether, the second keeps the card but stops it
  // carrying the product's own photograph — which is the half of this route
  // that decodes and re-encodes an image.
  const { ogImages, ogProductPhoto } = await computeSettingsOrDefaults();
  if (!ogImages || !ogProductPhoto) {
    return new Response(new Uint8Array(await blankCard()), {
      headers: {
        "Content-Type": "image/jpeg",
        "Cache-Control": "public, max-age=3600, s-maxage=86400",
      },
    });
  }

  const { slug } = await params;
  const input = await loadBuffer(slug);

  let out: Buffer;
  try {
    out = input
      ? await sharp(input)
          .resize(1200, 630, { fit: "contain", background: BG, withoutEnlargement: false })
          // Plain libjpeg, not mozjpeg. mozjpeg trades several times the CPU
          // for a few percent of file size, and this is a card a scraper
          // fetches once and then caches for a day — the bytes saved are not
          // worth the compute, which is the meter that is actually running.
          .jpeg({ quality: 80 })
          .toBuffer()
      : await blankCard();
  } catch {
    out = await blankCard();
  }

  return new Response(new Uint8Array(out), {
    headers: {
      "Content-Type": "image/jpeg",
      "Cache-Control": "public, max-age=3600, s-maxage=86400",
    },
  });
}
