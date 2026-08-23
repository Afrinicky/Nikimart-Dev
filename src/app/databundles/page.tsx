import { permanentRedirect } from "next/navigation";

/**
 * /databundles → /data-bundles.
 *
 * The real route has always been hyphenated, but the unhyphenated spelling
 * escaped into the "Buy Data Bundles" setting and from there into the sidebar,
 * the footer and the carousel — so it is out in the world on shared links and
 * in people's history. Settings are repaired on read (see
 * normaliseDataBundlesUrl); this catches everything already sent.
 */
export default function DataBundlesAliasPage() {
  permanentRedirect("/data-bundles");
}
