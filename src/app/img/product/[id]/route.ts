import { readProductImageBytes } from "@/lib/product-image-bytes";

export const runtime = "nodejs";

/** A 1×1 transparent PNG, for an id with nothing behind it. */
const BLANK = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==",
  "base64",
);

/**
 * A product photograph, as an image rather than as markup.
 *
 * This is `/brand/logo` applied to the catalogue, for the same reason and with
 * the same numbers behind it. The admin and seller forms accept a photograph
 * off a phone, downscale it to 1200px and store it as a `data:` URL — so a
 * single product row can hold 300 KB of base64, and that is what the page used
 * to carry.
 *
 * What that cost, concretely. A product card renders the photograph into an
 * inline `style="background-image:url(…)"`, and the gallery on a product page
 * passes its images to a *client* component, so Next serialises them twice —
 * once into the HTML and again into the Flight payload. A catalogue page with
 * forty products built forty of those strings, escaped them, and compressed
 * them, on every single request. None of it could be cached either: Vercel's
 * cache refuses an entry over 2 MB, which a page of base64 photographs clears
 * within about eight products, so the read behind it silently fell through to
 * the database every time as well.
 *
 * Serving the bytes here instead costs one request per photograph per browser.
 * The URL carries a digest of the bytes (see servedProductImage), so it is
 * cached immutably for a year by the CDN and by the browser, and a seller
 * replacing the photograph simply gets a new URL. The markup carries a
 * forty-character link, and the page becomes something a CDN can hold.
 *
 * `i` picks a gallery position; without it the primary image is served.
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const url = new URL(request.url);
  const index = Number(url.searchParams.get("i") ?? "0");

  const stored = await readProductImageBytes(
    id,
    Number.isInteger(index) && index > 0 ? index : 0,
  ).catch(() => null);

  const match = /^data:(image\/[a-z.+-]+);base64,(.+)$/i.exec(stored?.trim() ?? "");

  // A stored http(s) URL never reaches here — servedProductImage leaves those
  // alone — but a row edited by hand could hold one, and a redirect is a
  // better answer than a blank square.
  if (!match && stored && /^https?:\/\//i.test(stored.trim())) {
    return Response.redirect(stored.trim(), 308);
  }

  const body = match ? Buffer.from(match[2], "base64") : BLANK;
  const type = match ? match[1] : "image/png";

  // Only a URL carrying the digest may be cached hard: without one we cannot
  // know the bytes are still current, so it is revalidated instead.
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
