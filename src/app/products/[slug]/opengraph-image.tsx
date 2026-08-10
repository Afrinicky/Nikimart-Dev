import { ImageResponse } from "next/og";
import { getProductBySlug } from "@/lib/catalog";
import { absoluteImageUrl } from "@/lib/site";

// The default OG font has no cedi glyph (₵), so use the ISO code here — it
// renders everywhere. (The ₵ symbol is still used across the rest of the site.)
function ogPrice(value: number): string {
  return `GHS ${value.toLocaleString("en-GH", { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
}

// Needs Prisma (the product lookup), so run on Node, not the edge.
export const runtime = "nodejs";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
export const alt = "NikiMart product";

/**
 * Resolve a product image to something the renderer can always draw: data URLs
 * are used as-is; http(s) images are fetched and inlined (with a timeout) so a
 * slow or blocked host can't break the card — we fall back to the placeholder.
 */
async function loadImage(src: string | null): Promise<string | null> {
  if (!src) return null;
  if (src.startsWith("data:")) return src;
  try {
    const res = await fetch(src, { signal: AbortSignal.timeout(4000), cache: "no-store" });
    if (!res.ok) return null;
    const ct = res.headers.get("content-type") ?? "image/jpeg";
    if (!ct.startsWith("image/")) return null;
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length > 4_000_000) return null;
    return `data:${ct};base64,${buf.toString("base64")}`;
  } catch {
    return null;
  }
}

export default async function ProductOgImage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const product = await getProductBySlug(slug);

  const name = (product?.name ?? "NikiMart").slice(0, 90);
  const price = product ? ogPrice(product.price) : "";
  const gradFrom = product?.gradientFrom ?? "#0e1f36";
  const gradTo = product?.gradientTo ?? "#07111f";
  const emoji = product?.emoji ?? "🛍️";
  const img = product ? await loadImage(absoluteImageUrl(product.image)) : null;

  return new ImageResponse(
    (
      <div
        style={{
          display: "flex",
          width: "100%",
          height: "100%",
          position: "relative",
          background: `linear-gradient(135deg, ${gradFrom}, ${gradTo})`,
        }}
      >
        {img ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={img}
            width={1200}
            height={630}
            style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover" }}
          />
        ) : (
          <div style={{ display: "flex", width: "100%", height: "100%", alignItems: "center", justifyContent: "center", fontSize: 340 }}>
            {emoji}
          </div>
        )}

        <div
          style={{
            position: "absolute",
            left: 0,
            right: 0,
            bottom: 0,
            display: "flex",
            flexDirection: "column",
            padding: "48px 56px",
            background: "linear-gradient(to top, rgba(7,17,31,0.94), rgba(7,17,31,0.35) 62%, rgba(7,17,31,0))",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", fontSize: 34, fontWeight: 800, marginBottom: 14 }}>
            <span style={{ color: "#ffffff" }}>Niki</span>
            <span style={{ color: "#FF8A00" }}>Mart</span>
          </div>
          <div style={{ fontSize: 62, fontWeight: 800, color: "#ffffff", lineHeight: 1.1 }}>{name}</div>
          {price ? <div style={{ fontSize: 50, fontWeight: 800, color: "#FF8A00", marginTop: 14 }}>{price}</div> : null}
        </div>
      </div>
    ),
    size,
  );
}
