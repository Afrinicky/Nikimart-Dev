// Relative, with the extension: the geometry below is covered by a *.test.ts
// run through Node's type stripping, which resolves neither the "@/…" alias
// nor a missing extension.
import { FLYER_FONTS, fontStack, type FlyerFontKey, type FlyerImage } from "./affiliate-flyer.ts";

/**
 * The product photograph, shared as itself.
 *
 * The flyer is a poster: a frame, a headline, a price pill, a footer. It sells
 * well and it is unmistakably Nickimart's, which is exactly why it is not
 * always what somebody wants to post. A photograph that looks like a
 * photograph gets reposted to a status, cropped into a story, and forwarded in
 * a way a poster does not.
 *
 * So this draws the picture and nothing else — no frame, no card, no
 * lettering — except a watermark, which is the one mark that has to survive
 * the forward. The caption and the link still go with it in the message, as
 * they do for the flyer; the difference is entirely in the image.
 *
 * The watermark is the admin's to design: the wording, the face, the weight,
 * the colour, how strongly it sits on the picture, and where. The shop's own
 * logo can go on instead of or alongside the wording, at a size and a corner
 * of its own.
 *
 * Pure geometry and strings, like the flyer: no React, no browser globals
 * beyond the 2D context it is handed.
 */

// ---------------------------------------------------------------------------
// Where things sit
// ---------------------------------------------------------------------------

export const WATERMARK_ANCHORS = [
  { key: "top-left", label: "Top left" },
  { key: "top-center", label: "Top centre" },
  { key: "top-right", label: "Top right" },
  { key: "middle-left", label: "Middle left" },
  { key: "center", label: "Centre" },
  { key: "middle-right", label: "Middle right" },
  { key: "bottom-left", label: "Bottom left" },
  { key: "bottom-center", label: "Bottom centre" },
  { key: "bottom-right", label: "Bottom right" },
] as const;

export type WatermarkAnchor = (typeof WATERMARK_ANCHORS)[number]["key"];

export interface Point {
  x: number;
  y: number;
}

/**
 * The top-left corner of something anchored in a box.
 *
 * Nine anchors rather than a pair of coordinates, because "bottom right" is
 * what somebody means and it has to keep meaning that when the picture is
 * portrait rather than landscape. The nudge is applied afterwards, in the same
 * units as the box, so a design can be eased off a corner without losing which
 * corner it is in.
 */
export function anchorPoint(
  anchor: WatermarkAnchor,
  box: { width: number; height: number },
  item: { width: number; height: number },
  padding: number,
  nudge: Point = { x: 0, y: 0 },
): Point {
  const [vertical, horizontal] = anchor.split("-");

  const x =
    horizontal === "left"
      ? padding
      : horizontal === "right"
        ? box.width - item.width - padding
        : (box.width - item.width) / 2;

  const y =
    vertical === "top"
      ? padding
      : vertical === "bottom"
        ? box.height - item.height - padding
        : (box.height - item.height) / 2;

  return { x: x + nudge.x, y: y + nudge.y };
}

/**
 * How big the shared picture should be.
 *
 * The photograph's own shape is kept — that is the whole point of this mode —
 * but not necessarily its own pixels: a supplier's 4000px product shot is
 * several megabytes that WhatsApp will re-compress anyway, and building it on
 * a phone is where the share sheet runs out of memory. A long edge of 1600
 * survives being forwarded and fits comfortably.
 */
export function photoCanvasSize(
  imageWidth: number,
  imageHeight: number,
  maxEdge = 1600,
): { width: number; height: number } {
  const w = Math.max(1, Math.round(imageWidth));
  const h = Math.max(1, Math.round(imageHeight));
  const longest = Math.max(w, h);
  if (longest <= maxEdge) return { width: w, height: h };
  const scale = maxEdge / longest;
  return { width: Math.max(1, Math.round(w * scale)), height: Math.max(1, Math.round(h * scale)) };
}

// ---------------------------------------------------------------------------
// The watermark itself
// ---------------------------------------------------------------------------

export interface WatermarkLogo {
  enabled: boolean;
  /** Width as a percentage of the picture's width. */
  size: number;
  anchor: WatermarkAnchor;
  dx: number;
  dy: number;
  opacity: number;
}

export interface WatermarkConfig {
  /** Off shares the photograph untouched. */
  enabled: boolean;
  text: string;
  font: FlyerFontKey;
  /** Cap height as a percentage of the picture's width, so it scales with it. */
  size: number;
  weight: number;
  italic: boolean;
  uppercase: boolean;
  color: string;
  /** 0–100. Low is a watermark; high is a caption. */
  opacity: number;
  anchor: WatermarkAnchor;
  /** Nudge, as a percentage of the picture's width and height. */
  dx: number;
  dy: number;
  /** A soft shadow behind the lettering, for busy photographs. */
  shadow: boolean;
  /** Padding from the edge, as a percentage of the picture's width. */
  padding: number;
  logo: WatermarkLogo;
}

export const DEFAULT_WATERMARK: WatermarkConfig = {
  enabled: true,
  text: "Nickimart",
  font: "sans",
  size: 4,
  weight: 800,
  italic: false,
  uppercase: true,
  color: "#ffffff",
  opacity: 72,
  anchor: "bottom-right",
  dx: 0,
  dy: 0,
  shadow: true,
  padding: 3,
  logo: {
    enabled: false,
    size: 14,
    anchor: "bottom-left",
    dx: 0,
    dy: 0,
    opacity: 85,
  },
};

// --- Resolution -------------------------------------------------------------

function clampNumber(value: unknown, min: number, max: number, fallback: number): number {
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, Math.round(n * 100) / 100));
}

function colour(value: unknown, fallback: string): string {
  if (typeof value !== "string") return fallback;
  const trimmed = value.trim();
  return /^#[0-9a-fA-F]{3,8}$/.test(trimmed) ? trimmed : fallback;
}

function boolean(value: unknown, fallback: boolean): boolean {
  return typeof value === "boolean" ? value : fallback;
}

function anchor(value: unknown, fallback: WatermarkAnchor): WatermarkAnchor {
  return WATERMARK_ANCHORS.some((a) => a.key === value) ? (value as WatermarkAnchor) : fallback;
}

/**
 * A watermark from whatever was stored, merged onto a fallback.
 *
 * Same contract as the flyer's design: the value comes from a settings row an
 * admin can edit, so nothing here may assume it is sane, and anything
 * unreadable falls back to a watermark that still marks the picture.
 */
export function resolveWatermark(
  raw: string | null | undefined | Record<string, unknown>,
  fallback: WatermarkConfig = DEFAULT_WATERMARK,
): WatermarkConfig {
  let parsed: Record<string, unknown> = {};
  if (typeof raw === "string") {
    const trimmed = raw.trim();
    if (trimmed === "") return fallback;
    try {
      const value = JSON.parse(trimmed);
      if (value && typeof value === "object" && !Array.isArray(value)) {
        parsed = value as Record<string, unknown>;
      } else {
        return fallback;
      }
    } catch {
      return fallback;
    }
  } else if (raw && typeof raw === "object") {
    parsed = raw as Record<string, unknown>;
  } else {
    return fallback;
  }

  const logo = (parsed.logo ?? {}) as Record<string, unknown>;

  return {
    enabled: boolean(parsed.enabled, fallback.enabled),
    text: typeof parsed.text === "string" ? parsed.text.slice(0, 48) : fallback.text,
    font: FLYER_FONTS.some((f) => f.key === parsed.font)
      ? (parsed.font as FlyerFontKey)
      : fallback.font,
    // 1% of the width is a mark only a crop would find; 20% is a banner.
    size: clampNumber(parsed.size, 1, 20, fallback.size),
    weight: clampNumber(parsed.weight, 100, 900, fallback.weight),
    italic: boolean(parsed.italic, fallback.italic),
    uppercase: boolean(parsed.uppercase, fallback.uppercase),
    color: colour(parsed.color, fallback.color),
    opacity: clampNumber(parsed.opacity, 5, 100, fallback.opacity),
    anchor: anchor(parsed.anchor, fallback.anchor),
    dx: clampNumber(parsed.dx, -50, 50, fallback.dx),
    dy: clampNumber(parsed.dy, -50, 50, fallback.dy),
    shadow: boolean(parsed.shadow, fallback.shadow),
    padding: clampNumber(parsed.padding, 0, 20, fallback.padding),
    logo: {
      enabled: boolean(logo.enabled, fallback.logo.enabled),
      size: clampNumber(logo.size, 2, 60, fallback.logo.size),
      anchor: anchor(logo.anchor, fallback.logo.anchor),
      dx: clampNumber(logo.dx, -50, 50, fallback.logo.dx),
      dy: clampNumber(logo.dy, -50, 50, fallback.logo.dy),
      opacity: clampNumber(logo.opacity, 5, 100, fallback.logo.opacity),
    },
  };
}

// ---------------------------------------------------------------------------
// Drawing
// ---------------------------------------------------------------------------

export interface PhotoShareOptions {
  /** The photograph. Null draws the listing's placeholder instead. */
  image: FlyerImage | null;
  watermark: WatermarkConfig;
  /** The brand mark, already loaded. Ignored when the watermark omits it. */
  logo?: FlyerImage | null;
  /** The placeholder, for a listing with no photograph. */
  placeholder?: { gradientFrom: string; gradientTo: string; emoji: string };
}

/**
 * Draw the picture, and then the watermark over it.
 *
 * The context is expected to be exactly the size `photoCanvasSize` gave for
 * this image, so the photograph fills it edge to edge at its own ratio: no
 * crop, no letterbox, no frame. Everything the watermark measures is a
 * percentage of that width, which is what keeps one design looking the same on
 * a square photograph and a tall one.
 */
export function drawWatermarkedPhoto(
  ctx: CanvasRenderingContext2D,
  size: { width: number; height: number },
  options: PhotoShareOptions,
): void {
  const { width, height } = size;
  const { image, watermark, logo } = options;

  // --- The picture ----------------------------------------------------------
  if (image) {
    ctx.drawImage(image.source, 0, 0, width, height);
  } else {
    const placeholder = options.placeholder;
    const gradient = ctx.createLinearGradient(0, 0, width, height);
    gradient.addColorStop(0, placeholder?.gradientFrom || "#f1f5f9");
    gradient.addColorStop(1, placeholder?.gradientTo || "#cbd5e1");
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, width, height);
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.font = `400 ${Math.min(width, height) * 0.45}px ${fontStack("sans")}`;
    ctx.fillText(placeholder?.emoji || "🛍️", width / 2, height / 2);
  }

  if (!watermark.enabled) return;

  const pad = (watermark.padding / 100) * width;
  const nudge = { x: (watermark.dx / 100) * width, y: (watermark.dy / 100) * height };

  // --- The mark -------------------------------------------------------------
  if (watermark.logo.enabled && logo && logo.width > 0 && logo.height > 0) {
    const logoWidth = (watermark.logo.size / 100) * width;
    const logoHeight = (logoWidth * logo.height) / logo.width;
    const at = anchorPoint(
      watermark.logo.anchor,
      { width, height },
      { width: logoWidth, height: logoHeight },
      pad,
      { x: (watermark.logo.dx / 100) * width, y: (watermark.logo.dy / 100) * height },
    );
    ctx.save();
    ctx.globalAlpha = watermark.logo.opacity / 100;
    if (watermark.shadow) {
      ctx.shadowColor = "rgba(0,0,0,0.45)";
      ctx.shadowBlur = logoWidth * 0.08;
    }
    ctx.drawImage(logo.source, at.x, at.y, logoWidth, logoHeight);
    ctx.restore();
  }

  // --- The wording ----------------------------------------------------------
  const text = watermark.uppercase ? watermark.text.toUpperCase() : watermark.text;
  if (!text.trim()) return;

  const fontSize = (watermark.size / 100) * width;
  ctx.save();
  ctx.globalAlpha = watermark.opacity / 100;
  ctx.font = `${watermark.italic ? "italic " : ""}${watermark.weight} ${fontSize}px ${fontStack(watermark.font)}`;
  ctx.textAlign = "left";
  ctx.textBaseline = "top";

  const measured = ctx.measureText(text);
  // Cap height is close enough to the drawn height for placement, and does not
  // depend on the metrics some browsers still leave undefined.
  const textHeight = fontSize * 1.1;
  const at = anchorPoint(
    watermark.anchor,
    { width, height },
    { width: measured.width, height: textHeight },
    pad,
    nudge,
  );

  if (watermark.shadow) {
    // A watermark over a white product shot and a watermark over a dark one
    // are the same lettering; the shadow is what keeps both readable without
    // anybody having to pick a colour per photograph.
    ctx.shadowColor = "rgba(0,0,0,0.5)";
    ctx.shadowBlur = fontSize * 0.25;
    ctx.shadowOffsetY = fontSize * 0.04;
  }
  ctx.fillStyle = watermark.color;
  ctx.fillText(text, at.x, at.y);
  ctx.restore();
}

/** The filename a saved photograph gets. */
export function photoFileName(productName: string): string {
  const slug = productName
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 48);
  return `${slug || "nickimart-product"}.jpg`;
}
