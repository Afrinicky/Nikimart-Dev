// Relative, with the extension: the layout below is covered by a *.test.ts run
// through Node's type stripping, which resolves neither the "@/…" alias nor a
// missing extension (the same reason lib/payment-routing does it this way).
import { NETWORKS, bundleLabel, type Network } from "./networks.ts";

/**
 * The price-list flyer agents share on WhatsApp, drawn rather than designed.
 *
 * Agents have been having these made by hand — a designer, a screenshot of a
 * price table, a new one every time a price moves — so what they post is
 * usually out of date and rarely theirs. Here it is generated from the prices
 * their store is actually selling at, the moment they ask for it.
 *
 * It is drawn on a canvas rather than rendered as HTML and screenshotted: the
 * output has to be one image file that WhatsApp will accept, at a resolution
 * that survives being forwarded, and that means pixels either way. Doing it
 * directly costs one module and no dependency, and the layout below is the
 * whole design — no hidden DOM, no font loading race, no library that renders
 * subtly differently in the browser somebody happens to use.
 *
 * Pure geometry and strings: no React, no browser globals beyond the 2D
 * context it is handed, so the layout can be reasoned about (and the column
 * packing tested) on its own.
 */

export interface FlyerBundle {
  network: Network;
  sizeGb: number;
  price: number;
}

export interface FlyerData {
  storeName: string;
  /** Shown under the phone number, e.g. "nickimart.com/store/joycy". */
  storeLink: string;
  phone: string;
  bundles: FlyerBundle[];
  /** AFA registration price, or null when the agent doesn't sell it. */
  afaPrice: number | null;
  tagline: string;
}

export interface FlyerTheme {
  key: string;
  label: string;
  /** Page background, top to bottom. */
  backdropFrom: string;
  backdropTo: string;
  /** The headline and the footer bar. */
  ink: string;
  accent: string;
  onAccent: string;
  /** The pill behind the store name. */
  highlight: string;
}

export const FLYER_THEMES: FlyerTheme[] = [
  {
    key: "classic",
    label: "Classic",
    backdropFrom: "#f8fafc",
    backdropTo: "#e2e8f0",
    ink: "#0f172a",
    accent: "#1d4ed8",
    onAccent: "#ffffff",
    highlight: "#fde047",
  },
  {
    key: "midnight",
    label: "Midnight",
    backdropFrom: "#0f172a",
    backdropTo: "#1e293b",
    ink: "#f8fafc",
    accent: "#f97316",
    onAccent: "#ffffff",
    highlight: "#facc15",
  },
  {
    key: "sunrise",
    label: "Sunrise",
    backdropFrom: "#fff7ed",
    backdropTo: "#fed7aa",
    ink: "#7c2d12",
    accent: "#ea580c",
    onAccent: "#ffffff",
    highlight: "#fde047",
  },
];

/** The colours each network's column is drawn in, from its own brand. */
const COLUMN_STYLE: Record<Network, { header: string; body: string; onHeader: string; row: string }> = {
  MTN: { header: "#ffcc00", body: "#fffbeb", onHeader: "#111827", row: "#fef3c7" },
  TELECEL: { header: "#e2231a", body: "#fef2f2", onHeader: "#ffffff", row: "#fee2e2" },
  AIRTELTIGO_ISHARE: { header: "#0a5eb0", body: "#eff6ff", onHeader: "#ffffff", row: "#dbeafe" },
  AIRTELTIGO_BIGTIME: { header: "#1f8a70", body: "#ecfdf5", onHeader: "#ffffff", row: "#d1fae5" },
};

const COLUMN_TITLE: Record<Network, string> = {
  MTN: "MTN",
  TELECEL: "TELECEL",
  AIRTELTIGO_ISHARE: "AIRTELTIGO",
  AIRTELTIGO_BIGTIME: "AT BIGTIME",
};

export const FLYER_WIDTH = 1080;
export const FLYER_HEIGHT = 1350; // 4:5 — the tallest a WhatsApp preview shows uncropped.

export interface FlyerColumn {
  network: Network;
  title: string;
  rows: FlyerBundle[];
}

/**
 * Group the sellable bundles into at most three columns, in network order.
 *
 * Three because that is what fits at a size somebody can read on a phone —
 * a fourth network's rows would be narrower than the prices printed in them.
 * With more than three networks priced, the ones with the most sizes win: they
 * are the ladders a customer is choosing from.
 */
export function flyerColumns(bundles: FlyerBundle[], max = 3): FlyerColumn[] {
  const byNetwork = NETWORKS.map((network) => ({
    network,
    title: COLUMN_TITLE[network],
    rows: bundles
      .filter((b) => b.network === network && b.price > 0)
      .sort((a, b) => a.sizeGb - b.sizeGb),
  })).filter((c) => c.rows.length > 0);

  if (byNetwork.length <= max) return byNetwork;
  return [...byNetwork]
    .sort((a, b) => b.rows.length - a.rows.length)
    .slice(0, max)
    .sort((a, b) => NETWORKS.indexOf(a.network) - NETWORKS.indexOf(b.network));
}

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

const FONT_STACK =
  "'Helvetica Neue', Helvetica, Arial, 'Segoe UI', system-ui, sans-serif";

/**
 * Draw the whole flyer. The context is expected to be 1080×1350; everything
 * below is in those coordinates, so the caller can scale for a retina export by
 * scaling the context, not the layout.
 */
export function drawFlyer(
  ctx: CanvasRenderingContext2D,
  data: FlyerData,
  theme: FlyerTheme,
): void {
  const W = FLYER_WIDTH;
  const H = FLYER_HEIGHT;
  const columns = flyerColumns(data.bundles);

  // --- Backdrop -------------------------------------------------------------
  const bg = ctx.createLinearGradient(0, 0, 0, H);
  bg.addColorStop(0, theme.backdropFrom);
  bg.addColorStop(1, theme.backdropTo);
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);

  // --- Headline: the store's name, then what this is ------------------------
  ctx.textBaseline = "middle";
  ctx.textAlign = "center";

  const name = data.storeName.toUpperCase();
  const nameSize = fitFont(ctx, name, W * 0.52, 62, 30, "800");
  const nameWidth = ctx.measureText(name).width;
  // A store already called "… DATA" would otherwise read "DATA DATA".
  const suffix = /\bDATA\b/.test(name) ? "PRICE LIST" : "DATA PRICE LIST";
  ctx.font = `800 52px ${FONT_STACK}`;
  const suffixWidth = ctx.measureText(suffix).width;

  // Wide enough that the highlighter pill never touches the words after it.
  const gap = 44;
  const totalWidth = nameWidth + gap + suffixWidth;
  const startX = (W - totalWidth) / 2;
  const headY = 92;

  // The name sits in a highlighter pill, exactly as the hand-made ones do.
  ctx.fillStyle = theme.highlight;
  roundRect(ctx, startX - 26, headY - 40, nameWidth + 52, 80, 40);
  ctx.fill();

  ctx.fillStyle = "#111827";
  ctx.font = `800 ${nameSize}px ${FONT_STACK}`;
  ctx.textAlign = "left";
  ctx.fillText(name, startX, headY);

  ctx.fillStyle = theme.ink;
  ctx.font = `800 52px ${FONT_STACK}`;
  ctx.fillText(suffix, startX + nameWidth + gap, headY);

  // --- Sub-headline ---------------------------------------------------------
  ctx.textAlign = "center";
  const badge = (data.tagline || "NO EXPIRY · INSTANT DELIVERY").toUpperCase();
  fitFont(ctx, badge, W - 200, 26, 16, "700");
  const badgeWidth = ctx.measureText(badge).width + 64;
  ctx.fillStyle = theme.accent;
  roundRect(ctx, (W - badgeWidth) / 2, 148, badgeWidth, 54, 27);
  ctx.fill();
  ctx.fillStyle = theme.onAccent;
  ctx.fillText(badge, W / 2, 175);

  // --- Price columns --------------------------------------------------------
  const top = 240;
  const footerTop = data.afaPrice != null ? H - 268 : H - 212;
  const available = footerTop - top - 24;
  const sideMargin = 48;
  const columnGap = 24;
  const columnWidth =
    columns.length > 0
      ? (W - sideMargin * 2 - columnGap * (columns.length - 1)) / columns.length
      : 0;

  const headerHeight = 62;
  const longest = columns.reduce((n, c) => Math.max(n, c.rows.length), 1);
  // One row height across the whole flyer, set by the longest ladder: rows of
  // different heights side by side would read as a difference in the prices.
  const rowHeight = Math.min(52, Math.max(28, (available - headerHeight - 20) / longest));
  const cardHeight = headerHeight + longest * rowHeight + 20;

  columns.forEach((column, i) => {
    const x = sideMargin + i * (columnWidth + columnGap);
    const style = COLUMN_STYLE[column.network];
    // A shorter ladder sits in the middle of its card rather than leaving a
    // block of empty colour under it.
    const padTop = ((longest - column.rows.length) * rowHeight) / 2;

    ctx.fillStyle = style.body;
    roundRect(ctx, x, top, columnWidth, cardHeight, 22);
    ctx.fill();
    ctx.strokeStyle = style.header;
    ctx.lineWidth = 3;
    ctx.stroke();

    ctx.fillStyle = style.header;
    ctx.beginPath();
    ctx.roundRect(x, top, columnWidth, headerHeight, [22, 22, 0, 0]);
    ctx.fill();

    ctx.fillStyle = style.onHeader;
    ctx.textAlign = "center";
    fitFont(ctx, column.title, columnWidth - 28, 30, 18, "800");
    ctx.fillText(column.title, x + columnWidth / 2, top + headerHeight / 2 + 1);

    column.rows.forEach((row, r) => {
      const rowY = top + headerHeight + 10 + padTop + r * rowHeight;
      if (r % 2 === 1) {
        ctx.fillStyle = style.row;
        roundRect(ctx, x + 10, rowY, columnWidth - 20, rowHeight - 4, 10);
        ctx.fill();
      }

      const textY = rowY + (rowHeight - 4) / 2;
      const fontSize = Math.max(17, Math.min(26, rowHeight - 20));

      ctx.fillStyle = "#111827";
      ctx.textAlign = "left";
      ctx.font = `700 ${fontSize}px ${FONT_STACK}`;
      ctx.fillText(bundleLabel(row.sizeGb), x + 24, textY);

      ctx.textAlign = "right";
      ctx.font = `800 ${fontSize}px ${FONT_STACK}`;
      ctx.fillText(`GH₵${row.price.toFixed(2)}`, x + columnWidth - 24, textY);
    });
  });

  // --- AFA, when they sell it ----------------------------------------------
  if (data.afaPrice != null) {
    const text = `AFA REGISTRATION AVAILABLE @ GH₵${data.afaPrice.toFixed(2)}`;
    ctx.font = `800 28px ${FONT_STACK}`;
    const width = ctx.measureText(text).width + 72;
    ctx.fillStyle = theme.highlight;
    roundRect(ctx, (W - width) / 2, footerTop - 8, width, 58, 29);
    ctx.fill();
    ctx.fillStyle = "#111827";
    ctx.textAlign = "center";
    ctx.fillText(text, W / 2, footerTop + 21);
  }

  // --- Footer: how to reach them -------------------------------------------
  const barHeight = 96;
  const barY = H - barHeight - 84;
  ctx.fillStyle = theme.accent;
  roundRect(ctx, sideMargin, barY, W - sideMargin * 2, barHeight, 30);
  ctx.fill();

  ctx.fillStyle = theme.onAccent;
  ctx.textAlign = "center";
  fitFont(ctx, data.phone, W - sideMargin * 2 - 80, 52, 30, "800");
  ctx.fillText(data.phone, W / 2, barY + barHeight / 2);

  ctx.fillStyle = theme.ink;
  ctx.font = `700 24px ${FONT_STACK}`;
  ctx.fillText("CALL OR WHATSAPP FOR YOUR BUNDLE PACKAGES", W / 2, barY + barHeight + 32);

  ctx.font = `600 24px ${FONT_STACK}`;
  ctx.globalAlpha = 0.75;
  ctx.fillText(data.storeLink, W / 2, barY + barHeight + 68);
  ctx.globalAlpha = 1;
}

/** The message that goes to WhatsApp alongside the image. */
export function flyerShareText(data: FlyerData): string {
  const lines = [
    `*${data.storeName}* — data bundles at the best prices 📶`,
    "",
    "Order anytime, delivered instantly:",
    data.storeLink,
  ];
  if (data.phone) lines.push("", `Call or WhatsApp: ${data.phone}`);
  return lines.join("\n");
}
