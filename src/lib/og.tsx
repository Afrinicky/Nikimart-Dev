import { ImageResponse } from "next/og";
import sharp from "sharp";
import type { ReactElement } from "react";

// Shared Open Graph card helpers. Link-preview scrapers (WhatsApp especially)
// drop images that are too large, so every card is rendered then re-encoded as
// a compact JPEG via sharp — small and reliable across platforms.

export const OG_SIZE = { width: 1200, height: 630 };
export const OG_CONTENT_TYPE = "image/jpeg";

const CACHE = "public, max-age=3600, s-maxage=86400";

/** Render a React element (a card) to a compact JPEG buffer. */
export async function renderOgJpeg(element: ReactElement): Promise<Buffer> {
  const png = await new ImageResponse(element, OG_SIZE).arrayBuffer();
  return sharp(Buffer.from(png)).jpeg({ quality: 82, mozjpeg: true }).toBuffer();
}

/** Load image bytes from a data: URL or an http(s) URL (with a timeout). */
export async function loadImageBuffer(src: string | null): Promise<Buffer | null> {
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

/** A full-bleed 1200×630 JPEG cover of an image (for banner-based OG cards). */
export async function coverJpeg(buf: Buffer): Promise<Buffer> {
  return sharp(buf)
    .resize(OG_SIZE.width, OG_SIZE.height, { fit: "cover", position: "attention" })
    .jpeg({ quality: 80, mozjpeg: true })
    .toBuffer();
}

/** Normalise an image to a small square JPEG data: URL, for embedding in a card. */
export async function squareDataUrl(buf: Buffer, size = 220): Promise<string | null> {
  try {
    const out = await sharp(buf)
      .resize(size, size, { fit: "cover", position: "attention" })
      .jpeg({ quality: 82 })
      .toBuffer();
    return `data:image/jpeg;base64,${out.toString("base64")}`;
  } catch {
    return null;
  }
}

/** A JPEG Response with sensible caching, for use from an opengraph-image route. */
export function ogResponse(jpeg: Buffer): Response {
  return new Response(new Uint8Array(jpeg), {
    headers: { "Content-Type": OG_CONTENT_TYPE, "Cache-Control": CACHE },
  });
}
