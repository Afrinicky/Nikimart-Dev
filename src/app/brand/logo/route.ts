import { readImageSetting } from "@/lib/settings";

export const runtime = "nodejs";

/** A tiny transparent PNG, for when no logo is set or the stored one is unusable. */
const BLANK = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==",
  "base64",
);

/**
 * The brand logo, as an image rather than as markup.
 *
 * The admin logo field accepts a `data:` URL, so the setting can hold an entire
 * PNG in base64 — one measured 413 KB. It is passed to a client component,
 * which means Next serialises it twice: once into the `<img src>` and again
 * into the Flight payload. Rendered in the header, the sidebar and the footer,
 * that put six copies of the same image into every page the site served, and
 * every page weighed 2.5 MB of which 96% was this one logo repeated.
 *
 * Serving it here instead costs one request, once, per browser: the URL carries
 * a digest of the bytes, so it can be cached immutably for a year and a new
 * logo simply gets a new URL. The page markup carries a thirty-character link.
 */
export async function GET(request: Request) {
  const stored = (await readImageSetting("logoUrl").catch(() => null))?.trim() ?? "";
  const match = /^data:(image\/[a-z.+-]+);base64,(.+)$/i.exec(stored);

  const body = match ? Buffer.from(match[2], "base64") : BLANK;
  const type = match ? match[1] : "image/png";

  // Only a URL carrying the digest may be cached hard: without one we cannot
  // know the bytes are still current, so it is revalidated instead.
  const versioned = new URL(request.url).searchParams.has("v");
  return new Response(new Uint8Array(body), {
    headers: {
      "Content-Type": type,
      "Content-Length": String(body.length),
      "Cache-Control": versioned
        ? "public, max-age=31536000, immutable"
        : "public, max-age=0, s-maxage=3600, must-revalidate",
    },
  });
}
