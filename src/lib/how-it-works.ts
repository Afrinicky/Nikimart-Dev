/**
 * The steps on the public "How it works" page.
 *
 * They were six objects hardcoded in the page, so the only way to correct a
 * description of your own fulfilment process was a code change and a deploy.
 * They live in the `howItWorksSteps` setting now, as JSON.
 *
 * The parse is deliberately forgiving and always yields something renderable.
 * This is the page explaining how a stranger's money reaches a seller, and it
 * is edited from a free-text field: a stray character in that field must not
 * be able to leave the page blank, so anything unusable falls back to the
 * built-in set rather than rendering nothing.
 *
 * No `server-only` import and no dependencies, so the parsing is unit-tested
 * directly.
 */

export interface HowItWorksStep {
  title: string;
  body: string;
}

/** The set shipped with the app, used until an admin saves their own. */
export const DEFAULT_HOW_IT_WORKS: HowItWorksStep[] = [
  {
    title: "Search or paste a product link",
    body: "Browse Nickimart, or paste a link from Amazon, eBay, Alibaba, AliExpress, or a Dubai store into Buy-for-Me.",
  },
  {
    title: "Get a full landed-cost estimate",
    body: "See the product price plus foreign delivery, international freight, customs, pickup, and our service fee — no surprises.",
  },
  {
    title: "Pay securely in Ghana",
    body: "Pay in Ghana Cedis with Mobile Money, card, or bank transfer. Your funds are held safely until your order is on track.",
  },
  {
    title: "Item ships to our foreign warehouse",
    body: "The seller ships your item to our partner warehouse abroad, where we consolidate and prepare it for freight.",
  },
  {
    title: "Freight partner clears it",
    body: "We ship your item to Ghana and our freight partner handles customs clearance.",
  },
  {
    title: "Collect at a pickup point",
    body: "Your item arrives at your chosen pickup point. Collect it securely with a one-time OTP.",
  },
];

/** How many steps a page can usefully show before it stops being a summary. */
const MAX_STEPS = 20;

/**
 * Read the stored steps. Returns the built-in set when the value is empty or
 * cannot be read as a non-empty list of steps.
 */
export function parseHowItWorksSteps(raw: string | null | undefined): HowItWorksStep[] {
  const value = (raw ?? "").trim();
  if (!value) return DEFAULT_HOW_IT_WORKS;

  let parsed: unknown;
  try {
    parsed = JSON.parse(value);
  } catch {
    return DEFAULT_HOW_IT_WORKS;
  }
  if (!Array.isArray(parsed)) return DEFAULT_HOW_IT_WORKS;

  const steps: HowItWorksStep[] = [];
  for (const item of parsed) {
    if (!item || typeof item !== "object") continue;
    const { title, body } = item as Record<string, unknown>;
    // A step with no title has nothing to head it; a body is optional.
    if (typeof title !== "string" || !title.trim()) continue;
    steps.push({
      title: title.trim(),
      body: typeof body === "string" ? body.trim() : "",
    });
    if (steps.length === MAX_STEPS) break;
  }

  return steps.length ? steps : DEFAULT_HOW_IT_WORKS;
}

/** Serialise steps for storage, dropping any that would not render. */
export function serialiseHowItWorksSteps(steps: HowItWorksStep[]): string {
  const clean = steps
    .map((s) => ({ title: s.title.trim(), body: s.body.trim() }))
    .filter((s) => s.title)
    .slice(0, MAX_STEPS);
  return clean.length ? JSON.stringify(clean) : "";
}
