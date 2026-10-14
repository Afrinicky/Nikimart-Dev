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

/** Shrink the text until it fits `maxWidth`, never below `min`. */
function fitFont(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
  start: number,
  min: number,
  weight = "700",
): number {
  let size = start;
  while (size > min) {
    ctx.font = `${weight} ${size}px ${FONT_STACK}`;
    if (ctx.measureText(text).width <= maxWidth) break;
    size -= 2;
  }
  ctx.font = `${weight} ${size}px ${FONT_STACK}`;
  return size;
}

/** Anything the canvas can draw, with the dimensions cover-fitting needs. */
export interface FlyerImage {
  source: CanvasImageSource;
  width: number;
  height: number;
}

/**
 * Draw the whole flyer. The context is expected to be 1080×1350; everything
 * below is in those coordinates, so the caller can scale for a retina export
 * by scaling the context, not the layout.
 */
export function drawProductFlyer(
  ctx: CanvasRenderingContext2D,
  data: ProductFlyerData,
  theme: ProductFlyerTheme,
  image: FlyerImage | null = null,
): void {
  const W = FLYER_WIDTH;
  const H = FLYER_HEIGHT;
  const margin = 48;

  // --- Backdrop -------------------------------------------------------------
  const bg = ctx.createLinearGradient(0, 0, 0, H);
  bg.addColorStop(0, theme.backdropFrom);
  bg.addColorStop(1, theme.backdropTo);
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);

  ctx.textBaseline = "middle";

  // --- Header: the shop, then what this is ---------------------------------
  ctx.textAlign = "left";
  ctx.fillStyle = theme.ink;
  const shop = data.shopName.toUpperCase();
  fitFont(ctx, shop, W * 0.52, 40, 22, "800");
  ctx.fillText(shop, margin, 64);

  ctx.font = `600 22px ${FONT_STACK}`;
  ctx.fillStyle = theme.inkSoft;
  ctx.fillText(data.categoryName.toUpperCase(), margin, 104);

  // The brand pill, right-aligned: this is a Nickimart listing, and a flyer
  // that does not say so is a flyer people do not trust enough to tap.
  const brand = "NICKIMART";
  ctx.font = `800 24px ${FONT_STACK}`;
  const brandWidth = ctx.measureText(brand).width + 48;
  ctx.fillStyle = theme.accent;
  roundRect(ctx, W - margin - brandWidth, 42, brandWidth, 52, 26);
  ctx.fill();
  ctx.fillStyle = theme.onAccent;
  ctx.textAlign = "center";
  ctx.fillText(brand, W - margin - brandWidth / 2, 69);

  // --- The photograph -------------------------------------------------------
  const cardX = margin;
  const cardY = 140;
  const cardW = W - margin * 2;
  const cardH = 700;

  ctx.save();
  roundRect(ctx, cardX, cardY, cardW, cardH, 32);
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
    ctx.font = `400 320px ${FONT_STACK}`;
    ctx.textAlign = "center";
    ctx.fillText(data.emoji || "🛍️", cardX + cardW / 2, cardY + cardH / 2);
  }
  ctx.restore();

  // The discount flash, over the corner of the photograph.
  if (data.discount) {
    ctx.font = `800 34px ${FONT_STACK}`;
    const flash = data.discount.toUpperCase();
    const flashWidth = ctx.measureText(flash).width + 52;
    ctx.fillStyle = "#dc2626";
    roundRect(ctx, cardX + 24, cardY + 24, flashWidth, 62, 31);
    ctx.fill();
    ctx.fillStyle = "#ffffff";
    ctx.textAlign = "center";
    ctx.fillText(flash, cardX + 24 + flashWidth / 2, cardY + 55);
  }

  // --- Name and price ------------------------------------------------------
  const nameTop = cardY + cardH + 46;
  ctx.textAlign = "left";
  ctx.fillStyle = theme.ink;
  const nameSize = 46;
  ctx.font = `800 ${nameSize}px ${FONT_STACK}`;
  const nameLines = wrapLines(
    data.name,
    cardW,
    (t) => {
      ctx.font = `800 ${nameSize}px ${FONT_STACK}`;
      return ctx.measureText(t).width;
    },
    2,
  );
  nameLines.forEach((line, i) => {
    ctx.font = `800 ${nameSize}px ${FONT_STACK}`;
    ctx.fillText(line, margin, nameTop + i * (nameSize + 10));
  });

  const priceTop = nameTop + nameLines.length * (nameSize + 10) + 18;

  // The price sits in a highlighter pill — the one thing on the flyer somebody
  // scrolling has to be able to read at a glance.
  ctx.font = `800 62px ${FONT_STACK}`;
  const priceWidth = ctx.measureText(data.price).width;
  ctx.fillStyle = theme.highlight;
  roundRect(ctx, margin - 18, priceTop - 44, priceWidth + 44, 88, 44);
  ctx.fill();
  ctx.fillStyle = "#111827";
  ctx.font = `800 62px ${FONT_STACK}`;
  ctx.fillText(data.price, margin + 4, priceTop);

  if (data.oldPrice) {
    ctx.font = `600 34px ${FONT_STACK}`;
    const oldX = margin + priceWidth + 52;
    ctx.fillStyle = theme.inkSoft;
    ctx.fillText(data.oldPrice, oldX, priceTop + 4);
    const oldWidth = ctx.measureText(data.oldPrice).width;
    ctx.strokeStyle = theme.inkSoft;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(oldX - 2, priceTop + 4);
    ctx.lineTo(oldX + oldWidth + 2, priceTop + 4);
    ctx.stroke();
  }

  // --- The affiliate's own words -------------------------------------------
  const footerTop = H - 196;
  const messageTop = priceTop + 78;
  const messageSize = 30;
  ctx.fillStyle = theme.ink;
  const messageLines = wrapLines(
    data.message,
    cardW,
    (t) => {
      ctx.font = `600 ${messageSize}px ${FONT_STACK}`;
      return ctx.measureText(t).width;
    },
    // However many lines are left between the price and the footer.
    Math.max(1, Math.floor((footerTop - messageTop - 20) / (messageSize + 10))),
  );
  messageLines.forEach((line, i) => {
    ctx.font = `600 ${messageSize}px ${FONT_STACK}`;
    ctx.fillText(line, margin, messageTop + i * (messageSize + 10));
  });

  // --- Footer: where to buy it ---------------------------------------------
  const barHeight = 104;
  ctx.fillStyle = theme.accent;
  roundRect(ctx, margin, footerTop, cardW, barHeight, 32);
  ctx.fill();

  ctx.fillStyle = theme.onAccent;
  ctx.textAlign = "center";
  ctx.font = `800 26px ${FONT_STACK}`;
  ctx.fillText("ORDER ON NICKIMART", W / 2, footerTop + 36);
  fitFont(ctx, data.link, cardW - 80, 34, 20, "800");
  ctx.fillText(data.link, W / 2, footerTop + 74);

  ctx.fillStyle = theme.inkSoft;
  ctx.font = `600 22px ${FONT_STACK}`;
  ctx.fillText(
    data.sharedBy ? `Shared by ${data.sharedBy}` : "Pay on delivery options available",
    W / 2,
    footerTop + barHeight + 34,
  );
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

/** The filename a saved flyer gets. */
export function flyerFileName(productName: string): string {
  const slug = productName
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 48);
  return `${slug || "nickimart-product"}-nickimart.png`;
}
