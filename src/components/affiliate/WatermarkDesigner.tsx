"use client";

import { useActionState, useEffect, useMemo, useRef, useState } from "react";
import { Loader2, Move, RotateCcw, Save } from "lucide-react";
import { FLYER_FONTS, FLYER_WEIGHTS, type FlyerFontKey, type ProductFlyerData } from "@/lib/affiliate-flyer";
import {
  DEFAULT_WATERMARK,
  WATERMARK_ANCHORS,
  drawWatermarkedPhoto,
  placementFor,
  type PhotoHit,
  type WatermarkAnchor,
  type WatermarkConfig,
} from "@/lib/affiliate-watermark";
import { drawShare, shareCanvasSize, useShareImage } from "@/components/affiliate/share-canvas";
import {
  ColourField,
  Picker,
  Row,
  Section,
  Slider,
  Switch,
  TextField,
} from "@/components/affiliate/DesignControls";
import { cn } from "@/lib/cn";
import type { FlyerDesign } from "@/lib/affiliate-flyer";

/**
 * The watermark designer.
 *
 * The photograph share is the product's own picture with nothing added — no
 * frame, no price, no lettering — which is exactly what makes it worth
 * posting, and exactly why the one mark on it has to be right. So this is an
 * admin's screen only: a mark every affiliate could rewrite would not be a
 * mark at all.
 *
 * The preview is a real product photograph with the real drawing over it, so
 * "is that readable over a white product shot" is a question you answer by
 * looking rather than by sharing one and finding out. And the mark is dragged
 * on it: a drag re-chooses which corner it is anchored to from where it lands,
 * so the placement still means "bottom right, eased in" on the next
 * photograph of a different shape rather than becoming a pair of coordinates
 * that only suited this one.
 */

const FONT_OPTIONS = FLYER_FONTS.map((f) => ({ value: f.key, label: f.label }));
const WEIGHT_OPTIONS = FLYER_WEIGHTS.map((w) => ({ value: String(w.value), label: w.label }));

export function WatermarkDesigner({
  initial,
  sample,
  sampleImageUrl,
  logoUrl,
  design,
  action,
}: {
  initial: WatermarkConfig;
  sample: ProductFlyerData;
  sampleImageUrl: string | null;
  /** The platform's logo, when one is set. Empty disables the logo controls. */
  logoUrl: string;
  /** Only for the placeholder a listing with no photograph falls back to. */
  design: FlyerDesign;
  action: (
    state: { ok?: boolean; error?: string; message?: string },
    fd: FormData,
  ) => Promise<{ ok?: boolean; error?: string; message?: string }>;
}) {
  const [watermark, setWatermark] = useState<WatermarkConfig>(initial);
  const [state, submit, saving] = useActionState(action, {});
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const image = useShareImage(sampleImageUrl);
  const logo = useShareImage(logoUrl || null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    drawShare(canvas, "photo", { data: sample, design, watermark, image, logo });
  }, [watermark, image, logo, sample, design]);

  function patch(next: Partial<WatermarkConfig>) {
    setWatermark((w) => ({ ...w, ...next }));
  }

  function patchLogo(next: Partial<WatermarkConfig["logo"]>) {
    setWatermark((w) => ({ ...w, logo: { ...w.logo, ...next } }));
  }

  // --- dragging the mark ----------------------------------------------------
  //
  // The boxes come from drawing the photograph off-screen, because where the
  // lettering lands depends on how wide it measures. Both draws run the same
  // function, so what you can grab and what you can see cannot drift apart.
  const size = useMemo(() => shareCanvasSize("photo", image), [image]);
  const hits = useMemo<PhotoHit[]>(() => {
    if (typeof document === "undefined") return [];
    const canvas = document.createElement("canvas");
    canvas.width = size.width;
    canvas.height = size.height;
    const ctx = canvas.getContext("2d");
    if (!ctx) return [];
    const collected: PhotoHit[] = [];
    drawWatermarkedPhoto(ctx, size, {
      image,
      watermark,
      logo,
      hits: collected,
      placeholder: {
        gradientFrom: sample.gradientFrom,
        gradientTo: sample.gradientTo,
        emoji: sample.emoji,
      },
    });
    return collected;
  }, [image, logo, sample, size, watermark]);

  const [selected, setSelected] = useState<"watermark" | "logo" | null>(null);
  const drag = useRef<{
    id: "watermark" | "logo";
    mode: "move" | "resize";
    x: number;
    y: number;
    rect: PhotoHit["rect"];
    size: number;
  } | null>(null);

  const current = hits.find((h) => h.id === selected) ?? null;

  function toPixels(event: React.PointerEvent) {
    const box = event.currentTarget.getBoundingClientRect();
    return {
      x: ((event.clientX - box.left) / box.width) * size.width,
      y: ((event.clientY - box.top) / box.height) * size.height,
    };
  }

  function onPointerDown(event: React.PointerEvent) {
    const point = toPixels(event);
    // Last drawn wins, as it does visually.
    const hit = [...hits].reverse().find(
      (h) =>
        point.x >= h.rect.x &&
        point.x <= h.rect.x + h.rect.width &&
        point.y >= h.rect.y &&
        point.y <= h.rect.y + h.rect.height,
    );
    if (!hit) {
      setSelected(null);
      drag.current = null;
      return;
    }
    setSelected(hit.id);
    drag.current = {
      id: hit.id,
      mode: "move",
      x: point.x,
      y: point.y,
      rect: hit.rect,
      size: hit.id === "logo" ? watermark.logo.size : watermark.size,
    };
    event.currentTarget.setPointerCapture?.(event.pointerId);
  }

  function onPointerMove(event: React.PointerEvent) {
    const d = drag.current;
    if (!d) return;
    const point = toPixels(event);

    if (d.mode === "resize") {
      // 40% of the picture's width doubles the mark, which is a comfortable
      // pull on a phone and a short one on a trackpad.
      const factor = 1 + (point.x - d.x) / (size.width * 0.4);
      const next = Math.round(d.size * Math.max(0.1, factor) * 10) / 10;
      if (d.id === "logo") patchLogo({ size: Math.min(60, Math.max(2, next)) });
      else patch({ size: Math.min(20, Math.max(1, next)) });
      return;
    }

    const padding = (watermark.padding / 100) * size.width;
    const placed = placementFor(
      { x: d.rect.x + (point.x - d.x), y: d.rect.y + (point.y - d.y) },
      size,
      { width: d.rect.width, height: d.rect.height },
      padding,
    );
    if (d.id === "logo") patchLogo(placed);
    else patch(placed);
  }

  function endDrag(event: React.PointerEvent) {
    drag.current = null;
    event.currentTarget.releasePointerCapture?.(event.pointerId);
  }

  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,360px)_minmax(0,1fr)]">
      <div className="lg:sticky lg:top-24 lg:self-start">
        <div className="relative select-none overflow-hidden rounded-2xl ring-1 ring-niki-edge">
          <canvas
            ref={canvasRef}
            className="block h-auto w-full bg-white"
            role="img"
            aria-label="Watermark preview"
          />

          {/* `touch-none` is what stops the page scrolling under a drag. */}
          <div
            role="presentation"
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={endDrag}
            onPointerCancel={endDrag}
            className="absolute inset-0 touch-none"
          >
            {hits.map((hit) => (
              <div
                key={hit.id}
                aria-hidden
                className={cn(
                  "pointer-events-none absolute rounded",
                  hit.id === selected
                    ? "ring-2 ring-niki-orange"
                    : "ring-1 ring-transparent hover:ring-niki-orange/40",
                )}
                style={{
                  left: `${(hit.rect.x / size.width) * 100}%`,
                  top: `${(hit.rect.y / size.height) * 100}%`,
                  width: `${(hit.rect.width / size.width) * 100}%`,
                  height: `${(hit.rect.height / size.height) * 100}%`,
                }}
              />
            ))}

            {current ? (
              <button
                type="button"
                aria-label={`Resize ${current.label}`}
                onPointerDown={(e) => {
                  e.stopPropagation();
                  const point = toPixels(e);
                  drag.current = {
                    id: current.id,
                    mode: "resize",
                    x: point.x,
                    y: point.y,
                    rect: current.rect,
                    size: current.id === "logo" ? watermark.logo.size : watermark.size,
                  };
                  e.currentTarget.setPointerCapture?.(e.pointerId);
                }}
                onPointerMove={onPointerMove}
                onPointerUp={endDrag}
                onPointerCancel={endDrag}
                className="absolute flex h-5 w-5 items-center justify-center rounded-full bg-niki-orange text-white shadow-md ring-2 ring-white"
                style={{
                  left: `${((current.rect.x + current.rect.width) / size.width) * 100}%`,
                  top: `${((current.rect.y + current.rect.height) / size.height) * 100}%`,
                  transform: "translate(-50%, -50%)",
                  touchAction: "none",
                }}
              >
                <Move className="h-3 w-3" />
              </button>
            ) : null}
          </div>
        </div>
        <p className="mt-2 text-[11px] leading-relaxed text-niki-ink/45">
          A real product photograph at its own shape, with nothing on it but the mark. Drag the mark
          or the logo to place it, and pull the corner to resize.
        </p>

        <form action={submit} className="mt-3 space-y-2">
          <input type="hidden" name="watermark" value={JSON.stringify(watermark)} />
          <button
            type="submit"
            disabled={saving}
            className="niki-press niki-focus flex w-full items-center justify-center gap-2 rounded-xl bg-niki-orange px-4 py-3 text-sm font-bold text-white disabled:opacity-60"
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            Save watermark
          </button>
          <button
            type="button"
            onClick={() => setWatermark(DEFAULT_WATERMARK)}
            className="niki-press niki-focus flex w-full items-center justify-center gap-2 rounded-xl bg-white px-4 py-2.5 text-xs font-bold text-niki-ink/65 ring-1 ring-niki-edge hover:bg-niki-black/5"
          >
            <RotateCcw className="h-3.5 w-3.5" />
            Back to the default
          </button>

          {state.error ? (
            <p className="rounded-xl bg-niki-danger/10 px-3 py-2 text-center text-[11px] font-semibold text-niki-danger">
              {state.error}
            </p>
          ) : null}
          {state.message ? (
            <p className="rounded-xl bg-niki-success/10 px-3 py-2 text-center text-[11px] font-semibold text-niki-success">
              {state.message}
            </p>
          ) : null}
        </form>
      </div>

      <div className="space-y-3">
        <Section title="The mark" hint="What it says, and how it is lettered." defaultOpen>
          <Switch
            label="Watermark shared photographs"
            hint="Off shares the picture completely untouched."
            checked={watermark.enabled}
            onChange={(v) => patch({ enabled: v })}
          />
          <TextField
            label="Wording"
            value={watermark.text}
            maxLength={48}
            placeholder="Nickimart"
            onChange={(v) => patch({ text: v })}
          />
          <Row>
            <Picker
              label="Face"
              value={watermark.font}
              options={FONT_OPTIONS}
              onChange={(v) => patch({ font: v as FlyerFontKey })}
            />
            <Picker
              label="Weight"
              value={String(watermark.weight)}
              options={WEIGHT_OPTIONS}
              onChange={(v) => patch({ weight: Number(v) })}
            />
          </Row>
          <Row>
            <Switch
              label="Italic"
              checked={watermark.italic}
              onChange={(v) => patch({ italic: v })}
            />
            <Switch
              label="CAPITALS"
              checked={watermark.uppercase}
              onChange={(v) => patch({ uppercase: v })}
            />
          </Row>
          <ColourField
            label="Colour"
            value={watermark.color}
            fallback="#ffffff"
            allowInherit={false}
            onChange={(v) => patch({ color: v })}
          />
          <Switch
            label="Soft shadow behind it"
            hint="Keeps the mark readable over a white product shot and a dark one alike."
            checked={watermark.shadow}
            onChange={(v) => patch({ shadow: v })}
          />
        </Section>

        <Section title="Size & place" hint="Measured against the picture, so it scales with any shape." defaultOpen>
          <Slider
            label="Size"
            value={watermark.size}
            min={1}
            max={20}
            step={0.5}
            suffix="% of the width"
            onChange={(v) => patch({ size: v })}
          />
          <Slider
            label="Strength"
            value={watermark.opacity}
            min={5}
            max={100}
            suffix="%"
            onChange={(v) => patch({ opacity: v })}
          />
          <AnchorPicker
            label="Corner"
            value={watermark.anchor}
            onChange={(v) => patch({ anchor: v })}
          />
          <Slider
            label="Distance from the edge"
            value={watermark.padding}
            min={0}
            max={20}
            step={0.5}
            suffix="%"
            onChange={(v) => patch({ padding: v })}
          />
          <Row>
            <Slider
              label="Nudge across"
              value={watermark.dx}
              min={-50}
              max={50}
              suffix="%"
              onChange={(v) => patch({ dx: v })}
            />
            <Slider
              label="Nudge down"
              value={watermark.dy}
              min={-50}
              max={50}
              suffix="%"
              onChange={(v) => patch({ dy: v })}
            />
          </Row>
        </Section>

        <Section
          title="The logo"
          hint={
            logoUrl
              ? "Nickimart's own mark, on the picture alongside or instead of the wording."
              : "No logo is set for the platform yet — add one in Admin → Settings."
          }
        >
          <Switch
            label="Put the logo on the picture"
            checked={watermark.logo.enabled && Boolean(logoUrl)}
            onChange={(v) => patchLogo({ enabled: v })}
          />
          {!logoUrl ? (
            <p className="rounded-xl bg-niki-gold/15 px-3 py-2.5 text-[11px] text-amber-800">
              Set the brand logo in Admin → Settings first; this draws whatever is there.
            </p>
          ) : null}
          <Slider
            label="Width"
            value={watermark.logo.size}
            min={2}
            max={60}
            suffix="% of the picture"
            onChange={(v) => patchLogo({ size: v })}
          />
          <Slider
            label="Strength"
            value={watermark.logo.opacity}
            min={5}
            max={100}
            suffix="%"
            onChange={(v) => patchLogo({ opacity: v })}
          />
          <AnchorPicker
            label="Corner"
            value={watermark.logo.anchor}
            onChange={(v) => patchLogo({ anchor: v })}
          />
          <Row>
            <Slider
              label="Nudge across"
              value={watermark.logo.dx}
              min={-50}
              max={50}
              suffix="%"
              onChange={(v) => patchLogo({ dx: v })}
            />
            <Slider
              label="Nudge down"
              value={watermark.logo.dy}
              min={-50}
              max={50}
              suffix="%"
              onChange={(v) => patchLogo({ dy: v })}
            />
          </Row>
        </Section>
      </div>
    </div>
  );
}

/**
 * Nine corners as a grid of nine.
 *
 * A dropdown reading "middle-left" is a thing to decode; a 3×3 of dots is the
 * picture itself, and the choice is where you point.
 */
function AnchorPicker({
  label,
  value,
  onChange,
}: {
  label: string;
  value: WatermarkAnchor;
  onChange: (value: WatermarkAnchor) => void;
}) {
  return (
    <div>
      <span className="mb-1.5 block text-xs font-semibold text-niki-ink/70">{label}</span>
      <div className="grid w-[108px] grid-cols-3 gap-1 rounded-xl bg-niki-surface p-1.5 ring-1 ring-niki-edge">
        {WATERMARK_ANCHORS.map((anchor) => (
          <button
            key={anchor.key}
            type="button"
            title={anchor.label}
            aria-label={anchor.label}
            aria-pressed={value === anchor.key}
            onClick={() => onChange(anchor.key)}
            className={cn(
              "niki-focus flex h-8 items-center justify-center rounded-lg transition-colors",
              value === anchor.key ? "bg-niki-orange" : "bg-white hover:bg-niki-black/5",
            )}
          >
            <span
              aria-hidden
              className={cn(
                "h-1.5 w-1.5 rounded-full",
                value === anchor.key ? "bg-white" : "bg-niki-ink/30",
              )}
            />
          </button>
        ))}
      </div>
    </div>
  );
}
