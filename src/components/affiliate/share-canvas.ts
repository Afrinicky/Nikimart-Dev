"use client";

import { useEffect, useState } from "react";
import {
  FLYER_HEIGHT,
  FLYER_WIDTH,
  drawProductFlyer,
  type FlyerDesign,
  type FlyerImage,
  type ProductFlyerData,
} from "@/lib/affiliate-flyer";
import {
  drawWatermarkedPhoto,
  photoCanvasSize,
  type WatermarkConfig,
} from "@/lib/affiliate-watermark";

/**
 * Turning a product into a picture somebody can post.
 *
 * Shared between the share studio, which draws one onto a canvas on screen,
 * and the bulk share, which builds several off screen and hands them to the
 * device's share sheet at once. Keeping both on one implementation is what
 * stops "share" and "share all" producing different images.
 */

/** The two things a share can be. */
export type ShareMode = "flyer" | "photo";

/**
 * Load an image for the canvas, cross-origin so the export is not tainted.
 *
 * Returns null until it has loaded, and stays null if it never does — a host
 * that will not serve a picture cross-origin, or a dead URL. Both cases draw
 * the listing's own gradient and emoji instead, which is the placeholder the
 * storefront shows: a share that cannot be exported at all is worse than one
 * without a photograph.
 */
export function loadShareImage(url: string | null | undefined): Promise<FlyerImage | null> {
  const src = (url ?? "").trim();
  if (!src) return Promise.resolve(null);

  return new Promise((resolve) => {
    const img = new Image();
    // A data: URL needs no CORS and setting it would break nothing; a remote
    // one does, or toBlob throws a SecurityError on export.
    if (!src.startsWith("data:")) img.crossOrigin = "anonymous";
    img.onload = () =>
      resolve({ source: img, width: img.naturalWidth, height: img.naturalHeight });
    img.onerror = () => resolve(null);
    img.src = src;
  });
}

/** The same, as a hook, keyed on the URL so a stale picture is never drawn. */
export function useShareImage(url: string | null | undefined): FlyerImage | null {
  const [loaded, setLoaded] = useState<{ url: string; image: FlyerImage } | null>(null);

  useEffect(() => {
    const src = (url ?? "").trim();
    if (!src) return;
    let cancelled = false;
    void loadShareImage(src).then((image) => {
      if (!cancelled && image) setLoaded({ url: src, image });
    });
    return () => {
      cancelled = true;
    };
  }, [url]);

  return url && loaded?.url === url ? loaded.image : null;
}

export interface SharePiece {
  data: ProductFlyerData;
  design: FlyerDesign;
  watermark: WatermarkConfig;
  image: FlyerImage | null;
  logo: FlyerImage | null;
}

/** The pixel size a mode's canvas needs for this picture. */
export function shareCanvasSize(
  mode: ShareMode,
  image: FlyerImage | null,
): { width: number; height: number } {
  if (mode === "flyer") return { width: FLYER_WIDTH, height: FLYER_HEIGHT };
  // The photograph keeps its own shape — that is the whole point of the mode —
  // so the canvas takes the picture's ratio, scaled to something a phone can
  // build and WhatsApp will not mangle. With no picture at all it falls back
  // to the flyer's 4:5, which is what the placeholder is drawn for.
  if (!image) return { width: 1080, height: 1350 };
  return photoCanvasSize(image.width, image.height);
}

/** Draw one share onto a canvas that is already the right size. */
export function drawShare(
  canvas: HTMLCanvasElement,
  mode: ShareMode,
  piece: SharePiece,
): void {
  const size = shareCanvasSize(mode, piece.image);
  canvas.width = size.width;
  canvas.height = size.height;

  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  ctx.clearRect(0, 0, size.width, size.height);

  if (mode === "flyer") {
    drawProductFlyer(ctx, { data: piece.data, design: piece.design, image: piece.image });
    return;
  }

  drawWatermarkedPhoto(ctx, size, {
    image: piece.image,
    watermark: piece.watermark,
    logo: piece.logo,
    placeholder: {
      gradientFrom: piece.data.gradientFrom,
      gradientTo: piece.data.gradientTo,
      emoji: piece.data.emoji,
    },
  });
}

/**
 * A canvas as a file.
 *
 * The flyer is a PNG because it is flat colour and lettering, which JPEG makes
 * fuzzy at exactly the sizes the price is read at. A photograph is a JPEG,
 * because it is a photograph and a PNG of one is several times the size for no
 * visible gain — and a share sheet on a phone has a budget.
 */
export function canvasToBlob(canvas: HTMLCanvasElement, mode: ShareMode): Promise<Blob | null> {
  return new Promise((resolve) => {
    try {
      if (mode === "photo") {
        canvas.toBlob((blob) => resolve(blob), "image/jpeg", 0.9);
      } else {
        canvas.toBlob((blob) => resolve(blob), "image/png");
      }
    } catch {
      // A tainted canvas. The image loader falls back rather than drawing
      // something it cannot export, so this should not happen — but a share
      // that cannot be built has to say so rather than throw.
      resolve(null);
    }
  });
}

/** Build one share off screen and return it as a file ready to share. */
export async function buildShareFile(
  mode: ShareMode,
  piece: SharePiece,
  fileName: string,
): Promise<File | null> {
  const canvas = document.createElement("canvas");
  drawShare(canvas, mode, piece);
  const blob = await canvasToBlob(canvas, mode);
  if (!blob) return null;
  return new File([blob], fileName, { type: blob.type || "image/png" });
}

/** Save a blob to the device, which is the fallback everywhere share is not. */
export function saveBlob(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  a.click();
  URL.revokeObjectURL(url);
}
