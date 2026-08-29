/**
 * Where the "Buy Data Bundles" shortcuts point.
 *
 * The setting is free text because it has two legitimate jobs: it can point at
 * this site's own bundle page, or off to a storefront somewhere else entirely.
 * Telling those apart is the whole difficulty, and getting it wrong is silent —
 * a mangled value does not raise an error, it just produces a link that 404s.
 *
 * Pure, and in its own module rather than settings.ts, so it can be tested
 * without dragging in `server-only` and a database client.
 */

/** The site's own bundle page, and the value an empty setting falls back to. */
export const OWN_BUNDLE_PATH = "/data-bundles";

/**
 * True when this reads as somewhere else's address rather than a path here.
 *
 * The test is a dot in the first segment. "www.4ubundles.store/store/Nickland"
 * has one and is plainly a host; "data-bundles" and "shop/data" do not and are
 * plainly paths. A leading slash always means a path, whatever follows it.
 */
function looksLikeHost(value: string): boolean {
  if (value.startsWith("/")) return false;
  const firstSegment = value.split("/")[0];
  return firstSegment.includes(".") && !firstSegment.endsWith(".");
}

/**
 * Repair the stored link.
 *
 * Three jobs:
 *
 *  - An address typed without a scheme — which is how people write them, and
 *    how 4ubundles.store was typed — used to be read as a path and saved as
 *    "/www.4ubundles.store/store/Nickland": a page on Nickimart that does not
 *    exist. Every shortcut 404'd, with nothing to say why. It gets https://.
 *  - "/databundles" and its spellings become the real route, /data-bundles.
 *    That one spelling took out the sidebar, footer and carousel at once.
 *  - Anything already carrying a scheme is left exactly as it is.
 */
export function normaliseDataBundlesUrl(raw: string): string {
  const value = raw.trim();
  if (!value) return "";

  if (/^https?:\/\//i.test(value)) return value;

  // A scheme we don't serve links to — javascript:, data:, mailto: — is not a
  // storefront. Refuse it rather than render it as a link.
  if (/^[a-z][a-z0-9+.-]*:/i.test(value)) return "";

  if (value.startsWith("//")) return `https:${value}`;
  if (looksLikeHost(value)) return `https://${value}`;

  const path = value.startsWith("/") ? value : `/${value}`;
  // Compare on letters only, so /databundles, /data_bundles and /Data-Bundles
  // all resolve to the real route.
  const flattened = path.toLowerCase().replace(/[^a-z]/g, "");
  return flattened === "databundles" ? OWN_BUNDLE_PATH : path;
}

/** True when the link leaves Nickimart, and so needs target/rel on the anchor. */
export function isExternalStoreLink(url: string): boolean {
  return /^https?:\/\//i.test(url);
}
