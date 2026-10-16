// Relative, with the extension: the layout below is covered by a *.test.ts run
// through Node's type stripping, which resolves neither the "@/…" alias nor a
// missing extension (the same reason lib/data-bundles/flyer does it this way).
import { renderShareMessage } from "./affiliate-policy.ts";

/**
 * The product flyer an affiliate shares, drawn rather than designed.
 *
 * This is the data-bundle flyer's mechanism applied to retail, deliberately:
 * agents already share a generated picture, a short message and a link, that
 * is what gets opened in WhatsApp, and asking affiliates to learn a different
 * motion would only mean fewer shares. So the same three things go out — a
 * picture of the product, a caption the affiliate controls, and their own
 * link — and the same canvas approach produces them.
 *
 * Canvas rather than HTML-and-screenshot for the same reasons as the bundle
 * flyer: the output has to be one image file WhatsApp will accept, at a
 * resolution that survives being forwarded, with no font-loading race and no
 * dependency. What differs is that this one has a photograph in it, so the
 * layout has to cope with an image of any shape — and with not getting one at
 * all, because a listing with no photo still has to produce a flyer somebody
 * would post.
 *
 * Pure geometry and strings: no React, no browser globals beyond the 2D
 * context it is handed, so the layout can be reasoned about and the parts that
 * are arithmetic can be tested on their own.
 */

export interface ProductFlyerData {
  /** The product, as the buyer will see it. */
  name: string;
  price: string;
  /** Struck through beside the price, when the listing has one. */
  oldPrice?: string | null;
  /** A short "-30%" style flash, when there is a discount. */
  discount?: string | null;
  shopName: string;
  categoryName: string;
  /** The affiliate's caption. Already templated — see productFlyerShareText. */
  message: string;
  /** Printed along the bottom: nickimart.com/r/ABC123. */
  link: string;
  /** The affiliate's own name or store name, for the "shared by" line. */
  sharedBy: string;
  /** The emoji fallback when the listing has no photograph. */
  emoji: string;
  /** The placeholder gradient, from the listing itself. */
  gradientFrom: string;
  gradientTo: string;
}

export interface ProductFlyerTheme {
  key: string;
  label: string;
  backdropFrom: string;
  backdropTo: string;
  /** Headings and body. */
  ink: string;
  /** Muted body text. */
  inkSoft: string;
  /** The card behind the photograph and the price. */
  card: string;
  /** The footer bar and the price. */
  accent: string;
  onAccent: string;
  /** The highlighter pill behind the price. */
  highlight: string;
}

export const PRODUCT_FLYER_THEMES: ProductFlyerTheme[] = [
  {
    key: "nickimart",
    label: "Nickimart",
    backdropFrom: "#131313",
    backdropTo: "#2a1a0d",
    ink: "#ffffff",
    inkSoft: "rgba(255,255,255,0.68)",
    card: "#ffffff",
    accent: "#ff6a00",
    onAccent: "#ffffff",
    highlight: "#ffc53d",
  },
  {
    key: "clean",
    label: "Clean",
    backdropFrom: "#f8fafc",
    backdropTo: "#e2e8f0",
    ink: "#0f172a",
    inkSoft: "rgba(15,23,42,0.6)",
    card: "#ffffff",
    accent: "#1d4ed8",
    onAccent: "#ffffff",
    highlight: "#fde047",
  },
  {
    key: "sunrise",
    label: "Sunrise",
    backdropFrom: "#fff7ed",
    backdropTo: "#fed7aa",
    ink: "#7c2d12",
    inkSoft: "rgba(124,45,18,0.65)",
    card: "#ffffff",
    accent: "#ea580c",
    onAccent: "#ffffff",
    highlight: "#fde047",
  },
  {
    key: "midnight",
    label: "Midnight",
    backdropFrom: "#0f172a",
    backdropTo: "#1e293b",
    ink: "#f8fafc",
    inkSoft: "rgba(248,250,252,0.65)",
    card: "#ffffff",
    accent: "#38bdf8",
    onAccent: "#082f49",
    highlight: "#facc15",
  },
  {
    key: "forest",
    label: "Forest",
    backdropFrom: "#ecfdf5",
    backdropTo: "#a7f3d0",
    ink: "#064e3b",
    inkSoft: "rgba(6,78,59,0.65)",
    card: "#ffffff",
    accent: "#059669",
    onAccent: "#ffffff",
    highlight: "#fde047",
  },
  {
    key: "berry",
    label: "Berry",
    backdropFrom: "#fdf2f8",
    backdropTo: "#fbcfe8",
    ink: "#831843",
    inkSoft: "rgba(131,24,67,0.65)",
    card: "#ffffff",
    accent: "#db2777",
    onAccent: "#ffffff",
    highlight: "#fde047",
  },
];

export function flyerTheme(key: string | null | undefined): ProductFlyerTheme {
  return PRODUCT_FLYER_THEMES.find((t) => t.key === key) ?? PRODUCT_FLYER_THEMES[0];
}

export const FLYER_WIDTH = 1080;
export const FLYER_HEIGHT = 1350; // 4:5 — the tallest a WhatsApp preview shows uncropped.

const FONT_STACK = "'Helvetica Neue', Helvetica, Arial, 'Segoe UI', system-ui, sans-serif";

// ---------------------------------------------------------------------------
// The design
// ---------------------------------------------------------------------------

/**
 * How the flyer is laid out and lettered.
 *
 * The flyer used to be a fixed drawing with a choice of six colourways, which
 * was fine until the people whose shops it advertises wanted it to look like
 * their shop. So the layout is now data: an admin sets the house design, and
 * an affiliate may take it and make it theirs.
 *
 * Deliberately a schema rather than a free canvas. Elements flow — header,
 * picture, name, price, message, footer — and each one carries its own type
 * and a nudge, so a design can be made distinctly somebody's without any of
 * them being able to produce a flyer with the price off the bottom edge. The
 * frame is the one thing with real geometry, because "how much of this is the
 * photograph" is the decision that actually changes the look.
 *
 * Every number is clamped on the way in (see resolveFlyerDesign). The design
 * arrives as JSON from a database column somebody can edit, so nothing here
 * may assume it is sane.
 */

/** The faces on offer. System stacks only — a flyer must not wait on a font. */
export const FLYER_FONTS = [
  { key: "sans", label: "Helvetica", stack: "'Helvetica Neue', Helvetica, Arial, 'Segoe UI', system-ui, sans-serif" },
  { key: "grotesk", label: "Modern", stack: "'Segoe UI', Roboto, system-ui, 'Helvetica Neue', sans-serif" },
  { key: "rounded", label: "Rounded", stack: "'Trebuchet MS', 'Lucida Grande', 'Segoe UI', sans-serif" },
  { key: "condensed", label: "Condensed", stack: "'Arial Narrow', 'Helvetica Neue', Impact, sans-serif" },
  { key: "poster", label: "Poster", stack: "Impact, 'Arial Black', 'Helvetica Neue', sans-serif" },
  { key: "serif", label: "Serif", stack: "Georgia, 'Times New Roman', Times, serif" },
  { key: "mono", label: "Typewriter", stack: "'Courier New', Courier, monospace" },
] as const;

export type FlyerFontKey = (typeof FLYER_FONTS)[number]["key"];

export function fontStack(key: string | null | undefined): string {
  return (FLYER_FONTS.find((f) => f.key === key) ?? FLYER_FONTS[0]).stack;
}

/** The weights offered. Canvas takes any number; four is a choice, not a list. */
export const FLYER_WEIGHTS = [
  { value: 400, label: "Regular" },
  { value: 600, label: "Medium" },
  { value: 700, label: "Bold" },
  { value: 800, label: "Heavy" },
] as const;

export interface FlyerTextStyle {
  /** Point size in the flyer's own 1080×1350 space. */
  size: number;
  font: FlyerFontKey;
  weight: number;
  italic: boolean;
  /** Hex colour. Empty inherits whatever the theme gives this element. */
  color: string;
  uppercase: boolean;
  visible: boolean;
  /** Nudge, in flyer pixels. Bounded, so nothing can be pushed off the page. */
  dx: number;
  dy: number;
}

/** Every piece of lettering on the flyer, in the order it is drawn. */
export const FLYER_TEXT_KEYS = [
  "shop",
  "category",
  "badge",
  "discount",
  "name",
  "price",
  "oldPrice",
  "message",
  "footerLabel",
  "link",
  "sharedBy",
] as const;

export type FlyerTextKey = (typeof FLYER_TEXT_KEYS)[number];

/** What each one is, for the editor's labels. */
export const FLYER_TEXT_LABELS: Record<FlyerTextKey, string> = {
  shop: "Shop name",
  category: "Category line",
  badge: "Nickimart badge",
  discount: "Discount flash",
  name: "Product name",
  price: "Price",
  oldPrice: "Old price",
  message: "Your message",
  footerLabel: "Call to action",
  link: "Link",
  sharedBy: "Shared-by line",
};

/** Where an added feature sits. Slots, so nothing can land off the page. */
export const FLYER_SLOTS = [
  { key: "header", label: "Under the shop name" },
  { key: "onImage", label: "On the picture" },
  { key: "underImage", label: "Under the picture" },
  { key: "aboveFooter", label: "Above the link bar" },
] as const;

export type FlyerSlot = (typeof FLYER_SLOTS)[number]["key"];

export const FLYER_ALIGNMENTS = [
  { key: "left", label: "Left" },
  { key: "center", label: "Centre" },
  { key: "right", label: "Right" },
] as const;

export type FlyerAlign = (typeof FLYER_ALIGNMENTS)[number]["key"];

/**
 * Where an added feature's words come from.
 *
 * "custom" is somebody's own wording. Everything else is one of the flyer's
 * own facts — the price, the name, the link — which is what makes a feature
 * something you can have twice. A second price tag is not a copy of the first
 * one's text frozen at the moment it was added; it is the price, drawn again
 * somewhere else, and it follows the product like the original does.
 */
export const FLYER_SOURCES = [
  { key: "custom", label: "Your own words" },
  ...FLYER_TEXT_KEYS.map((key) => ({ key, label: FLYER_TEXT_LABELS[key] })),
] as const;

export type FlyerSource = "custom" | FlyerTextKey;

export function isFlyerSource(value: unknown): value is FlyerSource {
  return typeof value === "string" && FLYER_SOURCES.some((s) => s.key === value);
}

/** What one source actually says for this product. */
export function flyerContent(
  source: FlyerSource,
  data: ProductFlyerData,
  design: FlyerDesign,
): string {
  switch (source) {
    case "shop":
      return data.shopName;
    case "category":
      return data.categoryName;
    case "badge":
      return design.badge.label;
    case "discount":
      return data.discount ?? "";
    case "name":
      return data.name;
    case "price":
      return data.price;
    case "oldPrice":
      return data.oldPrice ?? "";
    case "message":
      return data.message;
    case "footerLabel":
      return "Order on Nickimart";
    case "link":
      return data.link;
    case "sharedBy":
      return data.sharedBy ? `Shared by ${data.sharedBy}` : "Pay on delivery options available";
    default:
      return "";
  }
}

/**
 * Something the designer added themselves.
 *
 * This is how a flyer gets a feature it does not already have, or a second one
 * of a feature it does. Each of the eleven built-in elements can be deleted,
 * and anything deleted — or anything wanted twice — comes back through here:
 * a line in one of four slots, drawing either its own words or one of the
 * flyer's facts, with or without a pill behind it.
 *
 * Slots rather than coordinates for the same reason the rest of the layout
 * flows: somebody should be able to make the flyer theirs without being able
 * to make one with the price underneath the footer. A nudge moves it from
 * there, bounded, which is what a drag writes.
 */
export interface FlyerExtra {
  /** Stable across edits, so the editor can keep a row's focus. */
  id: string;
  /** Where its words come from. "custom" uses `text`. */
  source: FlyerSource;
  text: string;
  slot: FlyerSlot;
  align: FlyerAlign;
  /** A pill behind the words. Empty draws the words alone. */
  background: string;
  style: FlyerTextStyle;
}

/** The words one added feature draws. */
export function extraWords(
  extra: FlyerExtra,
  data: ProductFlyerData,
  design: FlyerDesign,
): string {
  return extra.source === "custom" ? extra.text : flyerContent(extra.source, data, design);
}

/**
 * More than this and the flyer is a leaflet.
 *
 * Higher than it was, because added features are no longer only somebody's own
 * slogans: deleting a built-in and putting it back, or wanting two prices, now
 * spends one of these each.
 */
export const MAX_FLYER_EXTRAS = 12;

export interface FlyerDesign {
  /** The colourway everything inherits from. */
  theme: string;
  /** Colour overrides; empty inherits the theme's own. */
  colours: {
    backdropFrom: string;
    backdropTo: string;
    card: string;
    accent: string;
    highlight: string;
    ink: string;
    discount: string;
  };
  /** The photograph's frame — the part of the flyer that is the product. */
  frame: {
    /** Distance from the top of the flyer. */
    top: number;
    /** Margin left and right. Also the page's own margin. */
    side: number;
    height: number;
    radius: number;
  };
  /** The bar along the bottom that carries the link. */
  footer: {
    /** The bar itself. Its lettering is switched off separately. */
    visible: boolean;
    height: number;
    radius: number;
    /** Distance from the bottom of the flyer to the bottom of the bar. */
    bottom: number;
  };
  /** The badge in the top corner. */
  badge: { label: string; radius: number };
  /** The price's highlighter pill. Off leaves the price as plain lettering. */
  pricePill: boolean;
  text: Record<FlyerTextKey, FlyerTextStyle>;
  /** Lines the designer added. Each one can be removed again. */
  extras: FlyerExtra[];
}

function style(
  size: number,
  weight: number,
  extra: Partial<FlyerTextStyle> = {},
): FlyerTextStyle {
  return {
    size,
    font: "sans",
    weight,
    italic: false,
    color: "",
    uppercase: false,
    visible: true,
    dx: 0,
    dy: 0,
    ...extra,
  };
}

/** The house design: the flyer exactly as it was drawn before any of this. */
export const DEFAULT_FLYER_DESIGN: FlyerDesign = {
  theme: "nickimart",
  colours: {
    backdropFrom: "",
    backdropTo: "",
    card: "",
    accent: "",
    highlight: "",
    ink: "",
    discount: "#dc2626",
  },
  frame: { top: 140, side: 48, height: 700, radius: 32 },
  footer: { visible: true, height: 104, radius: 32, bottom: 92 },
  badge: { label: "NICKIMART", radius: 26 },
  pricePill: true,
  text: {
    shop: style(40, 800, { uppercase: true }),
    category: style(22, 600, { uppercase: true }),
    badge: style(24, 800, { uppercase: true }),
    discount: style(34, 800, { uppercase: true }),
    name: style(46, 800),
    price: style(62, 800),
    oldPrice: style(34, 600),
    message: style(30, 600),
    footerLabel: style(26, 800, { uppercase: true }),
    link: style(34, 800),
    sharedBy: style(22, 600),
  },
  extras: [],
};

/** A new added line, ready for the editor to hand to somebody. */
/**
 * A feature to drop on the flyer.
 *
 * Its own words by default, because that is what somebody reaches for first.
 * Given a source it draws one of the flyer's facts instead, which is how a
 * deleted price tag comes back — and how a second one appears beside it.
 */
export function newFlyerExtra(id: string, source: FlyerSource = "custom"): FlyerExtra {
  const builtIn = source !== "custom";
  return {
    id,
    source,
    text: builtIn ? "" : "Free delivery in Accra",
    slot: "underImage",
    align: "left",
    background: "",
    // A fact borrowed from elsewhere on the flyer starts at that element's own
    // size, so a second price tag looks like a price tag rather than a caption.
    style: builtIn ? { ...DEFAULT_FLYER_DESIGN.text[source] } : style(28, 700),
  };
}

// --- Resolution -------------------------------------------------------------

function clamp(value: unknown, min: number, max: number, fallback: number): number {
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, Math.round(n)));
}

/** A hex colour, or "" for "inherit". Anything else is not a colour. */
function colour(value: unknown, fallback: string): string {
  if (typeof value !== "string") return fallback;
  const trimmed = value.trim();
  if (trimmed === "") return "";
  return /^#[0-9a-fA-F]{3,8}$/.test(trimmed) ? trimmed : fallback;
}

function boolean(value: unknown, fallback: boolean): boolean {
  return typeof value === "boolean" ? value : fallback;
}

function resolveStyle(raw: unknown, fallback: FlyerTextStyle): FlyerTextStyle {
  const v = (raw ?? {}) as Partial<Record<keyof FlyerTextStyle, unknown>>;
  const font = FLYER_FONTS.some((f) => f.key === v.font) ? (v.font as FlyerFontKey) : fallback.font;
  return {
    // 10px is unreadable and 200px covers the page; both ends are a mistake
    // rather than a style, so the clamp is generous and still finite.
    size: clamp(v.size, 10, 200, fallback.size),
    font,
    weight: clamp(v.weight, 100, 900, fallback.weight),
    italic: boolean(v.italic, fallback.italic),
    color: colour(v.color, fallback.color),
    uppercase: boolean(v.uppercase, fallback.uppercase),
    visible: boolean(v.visible, fallback.visible),
    dx: clamp(v.dx, -400, 400, fallback.dx),
    dy: clamp(v.dy, -400, 400, fallback.dy),
  };
}

/**
 * A design from whatever was stored, merged onto a fallback.
 *
 * Two levels of fallback matter: an affiliate's design falls back to the
 * admin's house design, and the house design falls back to the built-in one.
 * So this takes the fallback rather than assuming the default — which is what
 * lets an admin change the house style and have it reach every affiliate who
 * has not overridden that particular part.
 */
export function resolveFlyerDesign(
  raw: string | null | undefined | Record<string, unknown>,
  fallback: FlyerDesign = DEFAULT_FLYER_DESIGN,
): FlyerDesign {
  let parsed: Record<string, unknown> = {};
  if (typeof raw === "string") {
    const trimmed = raw.trim();
    if (trimmed === "") return fallback;
    try {
      const value = JSON.parse(trimmed);
      if (value && typeof value === "object" && !Array.isArray(value)) {
        parsed = value as Record<string, unknown>;
      }
    } catch {
      // Unreadable JSON is a design nobody can fix from here. The fallback is
      // a flyer that still goes out.
      return fallback;
    }
  } else if (raw && typeof raw === "object") {
    parsed = raw as Record<string, unknown>;
  } else {
    return fallback;
  }

  const colours = (parsed.colours ?? {}) as Record<string, unknown>;
  const frame = (parsed.frame ?? {}) as Record<string, unknown>;
  const footer = (parsed.footer ?? {}) as Record<string, unknown>;
  const badge = (parsed.badge ?? {}) as Record<string, unknown>;
  const text = (parsed.text ?? {}) as Record<string, unknown>;

  const resolved: FlyerDesign = {
    theme: PRODUCT_FLYER_THEMES.some((t) => t.key === parsed.theme)
      ? String(parsed.theme)
      : fallback.theme,
    colours: {
      backdropFrom: colour(colours.backdropFrom, fallback.colours.backdropFrom),
      backdropTo: colour(colours.backdropTo, fallback.colours.backdropTo),
      card: colour(colours.card, fallback.colours.card),
      accent: colour(colours.accent, fallback.colours.accent),
      highlight: colour(colours.highlight, fallback.colours.highlight),
      ink: colour(colours.ink, fallback.colours.ink),
      discount: colour(colours.discount, fallback.colours.discount),
    },
    frame: {
      top: clamp(frame.top, 0, 600, fallback.frame.top),
      side: clamp(frame.side, 0, 240, fallback.frame.side),
      // The floor is a frame you can still see; the ceiling leaves room for
      // the price and the footer, which are the point of the flyer.
      height: clamp(frame.height, 200, 1000, fallback.frame.height),
      radius: clamp(frame.radius, 0, 160, fallback.frame.radius),
    },
    footer: {
      visible: boolean(footer.visible, fallback.footer.visible),
      height: clamp(footer.height, 48, 220, fallback.footer.height),
      radius: clamp(footer.radius, 0, 110, fallback.footer.radius),
      bottom: clamp(footer.bottom, 16, 300, fallback.footer.bottom),
    },
    badge: {
      label: typeof badge.label === "string" ? badge.label.slice(0, 24) : fallback.badge.label,
      radius: clamp(badge.radius, 0, 60, fallback.badge.radius),
    },
    pricePill: boolean(parsed.pricePill, fallback.pricePill),
    text: { ...fallback.text },
    extras: fallback.extras,
  };

  for (const key of FLYER_TEXT_KEYS) {
    resolved.text[key] = resolveStyle(text[key], fallback.text[key]);
  }

  // Added lines are the designer's own, so there is no per-item fallback to
  // merge onto: an entry that is not an object is dropped rather than
  // half-invented, and the list is capped at a length that still reads.
  const extras = Array.isArray(parsed.extras) ? parsed.extras : null;
  if (extras) {
    resolved.extras = extras
      .filter((e): e is Record<string, unknown> => Boolean(e) && typeof e === "object")
      .slice(0, MAX_FLYER_EXTRAS)
      .map((e, i) => ({
        id: typeof e.id === "string" && e.id ? e.id.slice(0, 24) : `extra-${i}`,
        source: isFlyerSource(e.source) ? e.source : "custom",
        text: typeof e.text === "string" ? e.text.slice(0, 80) : "",
        slot: FLYER_SLOTS.some((sl) => sl.key === e.slot) ? (e.slot as FlyerSlot) : "underImage",
        align: FLYER_ALIGNMENTS.some((a) => a.key === e.align) ? (e.align as FlyerAlign) : "left",
        background: colour(e.background, ""),
        style: resolveStyle(e.style, style(28, 700)),
      }))
      // An empty line of somebody's own is a line they abandoned. One that
      // draws a fact has nothing to type, so it is kept on its source alone.
      .filter((e) => e.source !== "custom" || e.text.trim() !== "");
  } else {
    resolved.extras = fallback.extras;
  }

  return resolved;
}

/** The colourway a design is built on, with its own overrides applied. */
export function designTheme(design: FlyerDesign): ProductFlyerTheme {
  const base = flyerTheme(design.theme);
  return {
    ...base,
    backdropFrom: design.colours.backdropFrom || base.backdropFrom,
    backdropTo: design.colours.backdropTo || base.backdropTo,
    card: design.colours.card || base.card,
    accent: design.colours.accent || base.accent,
    highlight: design.colours.highlight || base.highlight,
    ink: design.colours.ink || base.ink,
  };
}

// ---------------------------------------------------------------------------
// Geometry (testable on its own)
// ---------------------------------------------------------------------------

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** The part of a source image to draw. Same shape as Rect, named for its job. */
export type SourceRect = Rect;

/**
 * Where something ended up on the flyer.
 *
 * The layout flows — the name sits under the picture, the price under the
 * name — so nothing in the design says where anything actually is. That was
 * fine while the only way to move a thing was a pair of nudge sliders, and
 * useless the moment somebody should be able to put a finger on the price and
 * drag it. So the renderer reports what it drew and where, in flyer
 * coordinates, and the editor turns those boxes into things you can touch.
 *
 * Reported, not stored: the boxes are recomputed on every draw from the design
 * and the product, which is what keeps a picture of the flyer and the flyer
 * itself from ever disagreeing.
 */
export interface FlyerHit {
  /** Unique within one draw. "text:price", "extra:x1", "frame", "bar". */
  id: string;
  kind: "text" | "extra" | "frame" | "bar";
  /** Set when kind is "text". */
  key?: FlyerTextKey;
  /** Set when kind is "extra". */
  extraId?: string;
  label: string;
  rect: Rect;
  /** Whether a drag may move it, and whether a handle may resize it. */
  movable: boolean;
  resizable: boolean;
}

/** The topmost thing under a point, or null. Later draws win, as they do visually. */
export function hitAt(hits: readonly FlyerHit[], x: number, y: number): FlyerHit | null {
  for (let i = hits.length - 1; i >= 0; i--) {
    const { rect } = hits[i];
    if (x >= rect.x && x <= rect.x + rect.width && y >= rect.y && y <= rect.y + rect.height) {
      return hits[i];
    }
  }
  return null;
}

/** The nudge range a drag may write, matching what resolveFlyerDesign keeps. */
export const NUDGE_LIMIT = 400;
export const FLYER_SIZE_RANGE = { min: 10, max: 200 } as const;

/** Keep a dragged nudge inside what the design can store. */
export function clampNudge(value: number): number {
  return Math.min(NUDGE_LIMIT, Math.max(-NUDGE_LIMIT, Math.round(value)));
}

/** Keep a pinched size inside what the design can store. */
export function clampSize(value: number): number {
  return Math.min(FLYER_SIZE_RANGE.max, Math.max(FLYER_SIZE_RANGE.min, Math.round(value)));
}

/**
 * The part of a photograph to draw so it fills a box without distorting.
 *
 * Product photographs arrive at every ratio a phone camera and a supplier's
 * website can produce. Stretching one to fit makes a kettle look like a jug,
 * which on a flyer that is trying to sell the kettle is worse than cropping —
 * so the longer axis is cropped equally from both ends and the subject, which
 * on a product shot is always in the middle, survives.
 */
export function coverSource(
  imageWidth: number,
  imageHeight: number,
  boxWidth: number,
  boxHeight: number,
): SourceRect {
  if (!(imageWidth > 0) || !(imageHeight > 0) || !(boxWidth > 0) || !(boxHeight > 0)) {
    return { x: 0, y: 0, width: Math.max(1, imageWidth), height: Math.max(1, imageHeight) };
  }
  const imageRatio = imageWidth / imageHeight;
  const boxRatio = boxWidth / boxHeight;

  if (imageRatio > boxRatio) {
    // Too wide: keep the full height, crop the sides.
    const width = imageHeight * boxRatio;
    return { x: (imageWidth - width) / 2, y: 0, width, height: imageHeight };
  }
  // Too tall: keep the full width, crop top and bottom.
  const height = imageWidth / boxRatio;
  return { x: 0, y: (imageHeight - height) / 2, width: imageWidth, height };
}

/**
 * Break text into lines that fit, using a measuring function.
 *
 * The measurer is injected rather than taken off a canvas so the packing can
 * be tested without a browser. A word longer than the whole line is not split
 * — a product code broken across two lines reads as two product codes — it
 * simply overhangs, and the caller has already chosen a font size small
 * enough that it practically never happens.
 */
export function wrapLines(
  text: string,
  maxWidth: number,
  measure: (text: string) => number,
  maxLines = 3,
): string[] {
  const words = (text ?? "").split(/\s+/).filter(Boolean);
  if (words.length === 0) return [];

  const lines: string[] = [];
  let current = "";
  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (measure(candidate) <= maxWidth || !current) {
      current = candidate;
      continue;
    }
    lines.push(current);
    current = word;
    if (lines.length === maxLines) break;
  }
  if (lines.length < maxLines && current) lines.push(current);

  // Anything that did not fit becomes an ellipsis on the last line, so the
  // flyer never looks like it was cut off mid-sentence by accident.
  const used = lines.join(" ").split(/\s+/).filter(Boolean).length;
  if (used < words.length && lines.length > 0) {
    const last = lines.length - 1;
    let line = `${lines[last]}…`;
    while (measure(line) > maxWidth && line.length > 2) {
      line = `${line.slice(0, -2)}…`;
    }
    lines[last] = line;
  }
  return lines;
}

// ---------------------------------------------------------------------------
// Drawing
// ---------------------------------------------------------------------------

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
) {
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
}

/**
 * Shrink the text until it fits `maxWidth`, never below `min`.
 *
 * Takes the style rather than a weight, so a headline that has to come down
 * two points keeps the face and the weight it was given. Leaves the context's
 * font set to whatever it settled on, which is what the caller then draws in.
 */
function fitFont(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
  start: number,
  min: number,
  style: FlyerTextStyle,
): number {
  let size = start;
  while (size > min) {
    ctx.font = fontFor(style, size);
    if (ctx.measureText(text).width <= maxWidth) break;
    size -= 2;
  }
  ctx.font = fontFor(style, size);
  return size;
}

/** Anything the canvas can draw, with the dimensions cover-fitting needs. */
export interface FlyerImage {
  source: CanvasImageSource;
  width: number;
  height: number;
}

/** A text style as a canvas font string. */
function fontFor(style: FlyerTextStyle, size = style.size): string {
  return `${style.italic ? "italic " : ""}${style.weight} ${size}px ${fontStack(style.font)}`;
}

/** The text as it is drawn: the style decides whether it shouts. */
function cased(text: string, style: FlyerTextStyle): string {
  return style.uppercase ? text.toUpperCase() : text;
}

/**
 * One added line, drawn at a y and returned with the height it used.
 *
 * Alignment picks the edge rather than a coordinate, and the pill — when there
 * is one — is sized from the words, so a line somebody types in the editor
 * cannot come out overlapping the thing below it.
 */
function drawExtra(
  ctx: CanvasRenderingContext2D,
  extra: FlyerExtra,
  box: { left: number; width: number; y: number },
  theme: ProductFlyerTheme,
  content: { data: ProductFlyerData; design: FlyerDesign },
  /** Called with where it landed, so the editor can let a finger find it. */
  report?: (rect: Rect) => void,
): number {
  const text = cased(extraWords(extra, content.data, content.design), extra.style);
  if (!extra.style.visible || !text.trim()) return 0;

  ctx.font = fontFor(extra.style);
  const textWidth = Math.min(ctx.measureText(text).width, box.width - 48);
  const padding = extra.background ? 28 : 0;
  const pillWidth = textWidth + padding * 2;
  const pillHeight = extra.style.size + (extra.background ? 24 : 8);

  const x =
    extra.align === "right"
      ? box.left + box.width - pillWidth
      : extra.align === "center"
        ? box.left + (box.width - pillWidth) / 2
        : box.left;

  const left = x + extra.style.dx;
  const top = box.y + extra.style.dy;

  if (extra.background) {
    ctx.fillStyle = extra.background;
    roundRect(ctx, left, top, pillWidth, pillHeight, pillHeight / 2);
    ctx.fill();
  }

  ctx.fillStyle = extra.style.color || (extra.background ? "#ffffff" : theme.ink);
  ctx.textAlign = "left";
  ctx.textBaseline = "middle";
  ctx.font = fontFor(extra.style);
  ctx.fillText(text, left + padding, top + pillHeight / 2, box.width - 48);

  report?.({ x: left, y: top, width: pillWidth, height: pillHeight });
  return pillHeight + 12;
}

export interface DrawFlyerOptions {
  data: ProductFlyerData;
  design: FlyerDesign;
  image?: FlyerImage | null;
  /**
   * Hand in an array and it is filled with where everything landed, in flyer
   * coordinates. The editor needs it; the share path does not pass it and
   * pays nothing for it.
   */
  hits?: FlyerHit[];
}

/**
 * Draw the whole flyer. The context is expected to be 1080×1350; everything
 * below is in those coordinates, so the caller can scale for a retina export
 * by scaling the context, not the layout.
 *
 * The design decides every size, face and colour; the layout decides where
 * things go, flowing down the page from the frame. That split is the reason
 * somebody can be given control of the look without being handed a way to
 * produce a flyer with the price off the bottom edge.
 */
export function drawProductFlyer(ctx: CanvasRenderingContext2D, options: DrawFlyerOptions): void {
  const { data, design } = options;
  const image = options.image ?? null;
  const theme = designTheme(design);
  const W = FLYER_WIDTH;
  const H = FLYER_HEIGHT;
  const margin = design.frame.side;
  const contentWidth = W - margin * 2;
  const hits = options.hits;

  /** Note where an element landed, when anybody asked. */
  const record = (hit: FlyerHit) => {
    if (hits) hits.push(hit);
  };
  const textHit = (
    key: FlyerTextKey,
    rect: Rect,
    opts: { resizable?: boolean } = {},
  ) =>
    record({
      id: `text:${key}`,
      kind: "text",
      key,
      label: FLYER_TEXT_LABELS[key],
      rect,
      movable: true,
      resizable: opts.resizable ?? true,
    });

  // --- Backdrop -------------------------------------------------------------
  const bg = ctx.createLinearGradient(0, 0, 0, H);
  bg.addColorStop(0, theme.backdropFrom);
  bg.addColorStop(1, theme.backdropTo);
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);

  ctx.textBaseline = "middle";

  // --- Header: the shop, then what this is ---------------------------------
  const shopStyle = design.text.shop;
  if (shopStyle.visible && data.shopName) {
    ctx.textAlign = "left";
    ctx.fillStyle = shopStyle.color || theme.ink;
    const shop = cased(data.shopName, shopStyle);
    // Shrunk to fit rather than clipped: a long shop name is the one piece of
    // this somebody did not choose.
    fitFont(ctx, shop, W * 0.52, shopStyle.size, Math.min(22, shopStyle.size), shopStyle);
    ctx.fillText(shop, margin + shopStyle.dx, 64 + shopStyle.dy);
    textHit("shop", {
      x: margin + shopStyle.dx,
      y: 64 + shopStyle.dy - shopStyle.size * 0.7,
      width: ctx.measureText(shop).width,
      height: shopStyle.size * 1.4,
    });
  }

  const categoryStyle = design.text.category;
  if (categoryStyle.visible && data.categoryName) {
    ctx.textAlign = "left";
    ctx.font = fontFor(categoryStyle);
    ctx.fillStyle = categoryStyle.color || theme.inkSoft;
    const category = cased(data.categoryName, categoryStyle);
    ctx.fillText(category, margin + categoryStyle.dx, 104 + categoryStyle.dy);
    textHit("category", {
      x: margin + categoryStyle.dx,
      y: 104 + categoryStyle.dy - categoryStyle.size * 0.7,
      width: ctx.measureText(category).width,
      height: categoryStyle.size * 1.4,
    });
  }

  // Anything the designer added under the header.
  let headerY = 128;
  for (const extra of design.extras.filter((e) => e.slot === "header")) {
    headerY += drawExtra(
      ctx,
      extra,
      { left: margin, width: contentWidth, y: headerY },
      theme,
      { data, design },
      (rect) => record(extraHit(extra, rect, data, design)),
    );
  }

  // The badge in the corner: this is a Nickimart listing, and a flyer that
  // does not say so is a flyer people do not trust enough to tap.
  const badgeStyle = design.text.badge;
  if (badgeStyle.visible && design.badge.label) {
    const label = cased(design.badge.label, badgeStyle);
    ctx.font = fontFor(badgeStyle);
    const badgeWidth = ctx.measureText(label).width + 48;
    const badgeHeight = badgeStyle.size + 28;
    const badgeX = W - margin - badgeWidth + badgeStyle.dx;
    const badgeY = 42 + badgeStyle.dy;
    ctx.fillStyle = theme.accent;
    roundRect(ctx, badgeX, badgeY, badgeWidth, badgeHeight, design.badge.radius);
    ctx.fill();
    ctx.fillStyle = badgeStyle.color || theme.onAccent;
    ctx.textAlign = "center";
    ctx.font = fontFor(badgeStyle);
    ctx.fillText(label, badgeX + badgeWidth / 2, badgeY + badgeHeight / 2);
    textHit("badge", { x: badgeX, y: badgeY, width: badgeWidth, height: badgeHeight });
  }

  // --- The photograph -------------------------------------------------------
  const cardX = margin;
  const cardY = design.frame.top;
  const cardW = contentWidth;
  const cardH = design.frame.height;

  ctx.save();
  roundRect(ctx, cardX, cardY, cardW, cardH, design.frame.radius);
  ctx.fillStyle = theme.card;
  ctx.fill();
  ctx.clip();

  if (image) {
    const src = coverSource(image.width, image.height, cardW, cardH);
    ctx.drawImage(image.source, src.x, src.y, src.width, src.height, cardX, cardY, cardW, cardH);
  } else {
    // No photograph: the listing's own placeholder gradient and emoji, the
    // same pair the storefront shows. A flyer with a blank rectangle on it is
    // one nobody posts, and refusing to make one is worse.
    const placeholder = ctx.createLinearGradient(cardX, cardY, cardX + cardW, cardY + cardH);
    placeholder.addColorStop(0, data.gradientFrom || "#f1f5f9");
    placeholder.addColorStop(1, data.gradientTo || "#cbd5e1");
    ctx.fillStyle = placeholder;
    ctx.fillRect(cardX, cardY, cardW, cardH);
    ctx.font = `400 ${Math.min(cardW, cardH) * 0.45}px ${FONT_STACK}`;
    ctx.textAlign = "center";
    ctx.fillText(data.emoji || "🛍️", cardX + cardW / 2, cardY + cardH / 2);
  }
  ctx.restore();

  // The picture itself is draggable and resizable, which is what somebody
  // reaches for first: the frame is the flyer's one big decision.
  record({
    id: "frame",
    kind: "frame",
    label: "The picture",
    rect: { x: cardX, y: cardY, width: cardW, height: cardH },
    movable: true,
    resizable: true,
  });

  // The discount flash, over the corner of the photograph.
  const discountStyle = design.text.discount;
  if (discountStyle.visible && data.discount) {
    const flash = cased(data.discount, discountStyle);
    ctx.font = fontFor(discountStyle);
    const flashWidth = ctx.measureText(flash).width + 52;
    const flashHeight = discountStyle.size + 28;
    const flashX = cardX + 24 + discountStyle.dx;
    const flashY = cardY + 24 + discountStyle.dy;
    ctx.fillStyle = design.colours.discount || "#dc2626";
    roundRect(ctx, flashX, flashY, flashWidth, flashHeight, flashHeight / 2);
    ctx.fill();
    ctx.fillStyle = discountStyle.color || "#ffffff";
    ctx.textAlign = "center";
    ctx.font = fontFor(discountStyle);
    ctx.fillText(flash, flashX + flashWidth / 2, flashY + flashHeight / 2);
    textHit("discount", { x: flashX, y: flashY, width: flashWidth, height: flashHeight });
  }

  // Added lines that sit on the picture itself, stacked up from its foot.
  const onImage = design.extras.filter((e) => e.slot === "onImage");
  if (onImage.length > 0) {
    let stickerY = cardY + cardH - 24;
    for (const extra of [...onImage].reverse()) {
      const height = extra.style.size + (extra.background ? 24 : 8) + 12;
      stickerY -= height;
      drawExtra(
        ctx,
        extra,
        { left: cardX + 24, width: cardW - 48, y: stickerY },
        theme,
        { data, design },
        (rect) => record(extraHit(extra, rect, data, design)),
      );
    }
  }

  // --- Name and price ------------------------------------------------------
  const nameStyle = design.text.name;
  let cursor = cardY + cardH + 46;

  // Added lines between the picture and the name.
  for (const extra of design.extras.filter((e) => e.slot === "underImage")) {
    cursor += drawExtra(
      ctx,
      extra,
      { left: margin, width: contentWidth, y: cursor },
      theme,
      { data, design },
      (rect) => record(extraHit(extra, rect, data, design)),
    );
  }
  ctx.textBaseline = "middle";
  ctx.textAlign = "left";

  if (nameStyle.visible && data.name) {
    ctx.fillStyle = nameStyle.color || theme.ink;
    const nameLines = wrapLines(
      cased(data.name, nameStyle),
      contentWidth,
      (t) => {
        ctx.font = fontFor(nameStyle);
        return ctx.measureText(t).width;
      },
      2,
    );
    let nameWidth = 0;
    nameLines.forEach((line, i) => {
      ctx.font = fontFor(nameStyle);
      ctx.fillText(line, margin + nameStyle.dx, cursor + nameStyle.dy + i * (nameStyle.size + 10));
      nameWidth = Math.max(nameWidth, ctx.measureText(line).width);
    });
    textHit("name", {
      x: margin + nameStyle.dx,
      y: cursor + nameStyle.dy - nameStyle.size * 0.7,
      width: nameWidth,
      height: nameLines.length * (nameStyle.size + 10) + nameStyle.size * 0.4,
    });
    cursor += nameLines.length * (nameStyle.size + 10) + 18;
  }

  const priceStyle = design.text.price;
  let priceEndX = margin;
  if (priceStyle.visible && data.price) {
    const price = cased(data.price, priceStyle);
    const priceY = cursor + priceStyle.dy + priceStyle.size * 0.35;
    ctx.font = fontFor(priceStyle);
    const priceWidth = ctx.measureText(price).width;

    // The price sits in a highlighter pill — the one thing on the flyer
    // somebody scrolling has to be able to read at a glance.
    if (design.pricePill) {
      const pillHeight = priceStyle.size + 26;
      ctx.fillStyle = theme.highlight;
      roundRect(
        ctx,
        margin - 18 + priceStyle.dx,
        priceY - pillHeight / 2,
        priceWidth + 44,
        pillHeight,
        pillHeight / 2,
      );
      ctx.fill();
    }
    ctx.fillStyle = priceStyle.color || (design.pricePill ? "#111827" : theme.ink);
    ctx.font = fontFor(priceStyle);
    ctx.fillText(price, margin + 4 + priceStyle.dx, priceY);
    const pillHeight = priceStyle.size + 26;
    textHit("price", {
      x: margin - (design.pricePill ? 18 : 0) + priceStyle.dx,
      y: priceY - pillHeight / 2,
      width: priceWidth + (design.pricePill ? 44 : 8),
      height: pillHeight,
    });
    priceEndX = margin + priceStyle.dx + priceWidth + 52;

    const oldStyle = design.text.oldPrice;
    if (oldStyle.visible && data.oldPrice) {
      ctx.font = fontFor(oldStyle);
      const oldX = priceEndX + oldStyle.dx;
      const oldY = priceY + 4 + oldStyle.dy;
      ctx.fillStyle = oldStyle.color || theme.inkSoft;
      ctx.fillText(data.oldPrice, oldX, oldY);
      const oldWidth = ctx.measureText(data.oldPrice).width;
      ctx.strokeStyle = oldStyle.color || theme.inkSoft;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(oldX - 2, oldY);
      ctx.lineTo(oldX + oldWidth + 2, oldY);
      ctx.stroke();
      textHit("oldPrice", {
        x: oldX,
        y: oldY - oldStyle.size * 0.7,
        width: oldWidth,
        height: oldStyle.size * 1.4,
      });
    }
    cursor = priceY + priceStyle.size * 0.65 + 34;
  }

  // --- The affiliate's own words -------------------------------------------
  const footerTop = H - design.footer.bottom - design.footer.height;
  const messageStyle = design.text.message;
  if (messageStyle.visible && data.message) {
    const messageTop = cursor + messageStyle.dy;
    ctx.fillStyle = messageStyle.color || theme.ink;
    ctx.textAlign = "left";
    const messageLines = wrapLines(
      cased(data.message, messageStyle),
      contentWidth,
      (t) => {
        ctx.font = fontFor(messageStyle);
        return ctx.measureText(t).width;
      },
      // However many lines are left between the price and the footer.
      Math.max(1, Math.floor((footerTop - messageTop - 20) / (messageStyle.size + 10))),
    );
    let messageWidth = 0;
    messageLines.forEach((line, i) => {
      ctx.font = fontFor(messageStyle);
      ctx.fillText(line, margin + messageStyle.dx, messageTop + i * (messageStyle.size + 10));
      messageWidth = Math.max(messageWidth, ctx.measureText(line).width);
    });
    textHit("message", {
      x: margin + messageStyle.dx,
      y: messageTop - messageStyle.size * 0.7,
      width: messageWidth || contentWidth,
      height: messageLines.length * (messageStyle.size + 10) + messageStyle.size * 0.4,
    });
  }

  // Added lines just above the link bar — where a phone number or a delivery
  // promise reads best, because it is the last thing before the call to act.
  const aboveFooter = design.extras.filter((e) => e.slot === "aboveFooter");
  if (aboveFooter.length > 0) {
    let footerExtraY = footerTop - 16;
    for (const extra of [...aboveFooter].reverse()) {
      const height = extra.style.size + (extra.background ? 24 : 8) + 12;
      footerExtraY -= height;
      drawExtra(
        ctx,
        extra,
        { left: margin, width: contentWidth, y: footerExtraY },
        theme,
        { data, design },
        (rect) => record(extraHit(extra, rect, data, design)),
      );
    }
  }

  // --- Footer: where to buy it ---------------------------------------------
  ctx.textBaseline = "middle";
  const barHeight = design.footer.height;
  if (design.footer.visible) {
    ctx.fillStyle = theme.accent;
    roundRect(ctx, margin, footerTop, contentWidth, barHeight, design.footer.radius);
    ctx.fill();
    // Recorded before the lettering that sits on it, so a tap on a word gets
    // the word and a tap on the bar gets the bar.
    record({
      id: "bar",
      kind: "bar",
      label: "The link bar",
      rect: { x: margin, y: footerTop, width: contentWidth, height: barHeight },
      movable: true,
      resizable: true,
    });
  }

  ctx.textAlign = "center";
  const labelStyle = design.text.footerLabel;
  const linkStyle = design.text.link;
  // The two footer lines share the bar, so they are placed against its middle
  // rather than its top: a taller bar keeps them centred instead of leaving a
  // gap underneath.
  const barMid = footerTop + barHeight / 2;
  const hasLabel = labelStyle.visible && Boolean(data.link);
  if (hasLabel) {
    ctx.fillStyle = labelStyle.color || theme.onAccent;
    ctx.font = fontFor(labelStyle);
    const label = cased("Order on Nickimart", labelStyle);
    const labelY = barMid - labelStyle.size * 0.7 + labelStyle.dy;
    ctx.fillText(label, W / 2 + labelStyle.dx, labelY);
    const labelWidth = ctx.measureText(label).width;
    textHit("footerLabel", {
      x: W / 2 + labelStyle.dx - labelWidth / 2,
      y: labelY - labelStyle.size * 0.7,
      width: labelWidth,
      height: labelStyle.size * 1.4,
    });
  }
  if (linkStyle.visible && data.link) {
    ctx.fillStyle = linkStyle.color || theme.onAccent;
    fitFont(ctx, data.link, contentWidth - 80, linkStyle.size, 18, linkStyle);
    const linkY = hasLabel ? barMid + linkStyle.size * 0.6 + linkStyle.dy : barMid + linkStyle.dy;
    ctx.fillText(data.link, W / 2 + linkStyle.dx, linkY);
    const linkWidth = ctx.measureText(data.link).width;
    textHit("link", {
      x: W / 2 + linkStyle.dx - linkWidth / 2,
      y: linkY - linkStyle.size * 0.7,
      width: linkWidth,
      height: linkStyle.size * 1.4,
    });
  }

  const sharedStyle = design.text.sharedBy;
  if (sharedStyle.visible) {
    ctx.fillStyle = sharedStyle.color || theme.inkSoft;
    ctx.font = fontFor(sharedStyle);
    const shared = data.sharedBy ? `Shared by ${data.sharedBy}` : "Pay on delivery options available";
    const sharedY = footerTop + barHeight + 34 + sharedStyle.dy;
    ctx.fillText(shared, W / 2 + sharedStyle.dx, sharedY);
    const sharedWidth = ctx.measureText(shared).width;
    textHit("sharedBy", {
      x: W / 2 + sharedStyle.dx - sharedWidth / 2,
      y: sharedY - sharedStyle.size * 0.7,
      width: sharedWidth,
      height: sharedStyle.size * 1.4,
    });
  }
}

/** One added feature's box, named so the editor can show what it is. */
function extraHit(
  extra: FlyerExtra,
  rect: Rect,
  data: ProductFlyerData,
  design: FlyerDesign,
): FlyerHit {
  const words = extraWords(extra, data, design).trim();
  return {
    id: `extra:${extra.id}`,
    kind: "extra",
    extraId: extra.id,
    // A borrowed fact is named for what it is, not for what it happens to say
    // today: "Price" stays "Price" when the product changes.
    label:
      extra.source === "custom"
        ? words.slice(0, 24) || "Your line"
        : FLYER_TEXT_LABELS[extra.source],
    rect,
    movable: true,
    resizable: true,
  };
}

// ---------------------------------------------------------------------------
// The message that goes with it
// ---------------------------------------------------------------------------

export interface ShareTextInput {
  productName: string;
  price: string;
  shopName: string;
  link: string;
  /** The caption: the product's own, else the affiliate's, else the default. */
  template: string;
}

/**
 * The WhatsApp message that goes out alongside the image.
 *
 * The caption is the affiliate's to write, so it is rendered through the
 * template filler rather than assembled here — and a caption that forgets the
 * link has it appended, because a post nobody can buy from is the one failure
 * this whole feature cannot survive.
 */
export function productFlyerShareText(input: ShareTextInput): string {
  const caption = renderShareMessage(input.template, {
    product: input.productName,
    price: input.price,
    link: input.link,
    shop: input.shopName,
  });
  // The product and price lead, so the message reads as something specific
  // even when the affiliate's caption is a single word.
  const headline = `*${input.productName}* — ${input.price}`;
  return caption.includes(input.productName) ? caption : `${headline}\n\n${caption}`;
}

/**
 * The most products one batch can carry.
 *
 * Each one is posted separately, so the limit is no longer what a share sheet
 * will take in one go — it is how many posts somebody will actually stand
 * there and tap through before abandoning the rest half-shared.
 */
export const MAX_BULK_SHARE = 10;

/** The filename a saved flyer gets. */
export function flyerFileName(productName: string): string {
  const slug = productName
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 48);
  return `${slug || "nickimart-product"}-nickimart.png`;
}
