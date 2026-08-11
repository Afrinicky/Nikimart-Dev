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

/** A JPEG Response with sensible caching, for use from an opengraph-image route. */
export function ogResponse(jpeg: Buffer): Response {
  return new Response(new Uint8Array(jpeg), {
    headers: { "Content-Type": OG_CONTENT_TYPE, "Cache-Control": CACHE },
  });
}
