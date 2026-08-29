import sharp from "sharp";
import { getProductBySlug } from "@/lib/catalog";
import { absoluteImageUrl } from "@/lib/site";

// Needs Prisma + sharp, so run on Node. Output a small JPEG (not a heavy PNG):
// WhatsApp and other scrapers silently drop preview images that are too large,
// so we compress the actual product photo well under their limit.
export const runtime = "nodejs";
export const size = { width: 1200, height: 630 };
export const contentType = "image/jpeg";
export const alt = "Nickimart product";

// Nickimart navy — fills the letterbox bars around non-landscape photos.
const BG = { r: 14, g: 31, b: 54, alpha: 1 };

/** Load the product image bytes from a data: URL or an http(s) URL. */
async function loadBuffer(src: string | null): Promise<Buffer | null> {
  if (!src) return null;
  try {
    if (src.startsWith("data:")) {
      const comma = src.indexOf(",");
      if (comma === -1) return null;
      const isB64 = src.slice(5, comma).includes("base64");
      const payload = src.slice(comma + 1);
      return isB64 ? Buffer.from(payload, "base64") : Buffer.from(decodeURIComponent(payload));
    }
    const res = await fetch(src, { signal: AbortSignal.timeout(5000), cache: "no-store" });
    if (!res.ok) return null;
    const ct = res.headers.get("content-type") ?? "";
    if (ct && !ct.startsWith("image/")) return null;
    const ab = await res.arrayBuffer();
    if (ab.byteLength > 15_000_000) return null;
    return Buffer.from(ab);
  } catch {
    return null;
  }
}

async function blankCard(): Promise<Buffer> {
  return sharp({ create: { width: 1200, height: 630, channels: 3, background: BG } }).jpeg({ quality: 80 }).toBuffer();
}

export default async function ProductOgImage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const product = await getProductBySlug(slug);
  const src = product ? absoluteImageUrl(product.image) : null;
  const input = await loadBuffer(src);

  let out: Buffer;
  try {
    out = input
      ? await sharp(input)
          .resize(1200, 630, { fit: "contain", background: BG, withoutEnlargement: false })
          .jpeg({ quality: 80, mozjpeg: true })
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
