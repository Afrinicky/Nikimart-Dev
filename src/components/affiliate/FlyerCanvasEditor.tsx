"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  AlignCenter,
  AlignLeft,
  AlignRight,
  Bold,
  Copy,
  CornerRightDown,
  Image as ImageIcon,
  Italic,
  Link2,
  Minus,
  Plus,
  RotateCcw,
  Trash2,
  Type,
  X,
} from "lucide-react";
import {
  clampNudge,
  clampSize,
  DEFAULT_FLYER_DESIGN,
  drawProductFlyer,
  FLYER_ALIGNMENTS,
  FLYER_FONTS,
  FLYER_HEIGHT,
  FLYER_SOURCES,
  FLYER_TEXT_KEYS,
  FLYER_TEXT_LABELS,
  FLYER_WIDTH,
  MAX_FLYER_EXTRAS,
  hitAt,
  newFlyerExtra,
  type FlyerAlign,
  type FlyerDesign,
  type FlyerExtra,
  type FlyerFontKey,
  type FlyerHit,
  type FlyerImage,
  type FlyerSource,
  type FlyerTextKey,
  type FlyerTextStyle,
  type ProductFlyerData,
} from "@/lib/affiliate-flyer";
import { cn } from "@/lib/cn";

/**
 * The flyer, edited by touching it.
 *
 * Everything used to sit behind a slider in a panel under the preview: to move
 * the price you scrolled past the flyer, found "Price", dragged "Nudge
 * across", and scrolled back to see what happened. Nobody edits a picture that
 * way, and the parts you could add or take away were so far down the page that
 * people reasonably concluded they did not exist.
 *
 * So the flyer is the editor. Tap a thing to select it, drag it to move it,
 * pull its corner or pinch to resize, and the one row under the canvas becomes
 * the handful of controls that thing actually has. Nothing moves further than
 * the design can store, because a drag writes the same bounded number the
 * slider did.
 *
 * Three things make it a whole editor rather than a nudge tool. Every part can
 * be deleted — including the picture and the link bar, which are the flyer's
 * two biggest pieces. Every part can be put back. And any of them can be added
 * again, so a flyer can carry two prices, or the product name twice, each
 * placed on its own. The parts tray is how a deleted thing is reachable at
 * all: once something draws nothing it has no box to tap, and without a list
 * of the parts there would be no way back to it.
 */

type Selection = string | null;

interface Gesture {
  mode: "move" | "resize" | "pinch";
  id: string;
  /** Flyer-space start point of the drag. */
  x: number;
  y: number;
  /** Two-finger start distance, for a pinch. */
  distance: number;
  start: {
    dx: number;
    dy: number;
    size: number;
    top: number;
    height: number;
    side: number;
    bottom: number;
  };
}

function emptyStart(): Gesture["start"] {
  return { dx: 0, dy: 0, size: 0, top: 0, height: 0, side: 0, bottom: 0 };
}

/** Every part of the flyer, for the tray and the add menu. */
interface Part {
  id: string;
  label: string;
  on: boolean;
  /** Turning it on or off. The picture and the bar are not text. */
  toggle: (on: boolean) => void;
}

export function FlyerCanvasEditor({
  design,
  onChange,
  data,
  image,
  className,
}: {
  design: FlyerDesign;
  onChange: (next: FlyerDesign) => void;
  data: ProductFlyerData;
  image: FlyerImage | null;
  className?: string;
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [selected, setSelected] = useState<Selection>(null);
  const [adding, setAdding] = useState(false);
  const gesture = useRef<Gesture | null>(null);
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  // Ids for added features. A counter rather than a clock: it only has to be
  // unique within this design, and reading the time while rendering is the
  // kind of impurity that makes a component's output depend on when it ran.
  const nextId = useRef(1);
  const makeId = () => `x${(nextId.current++).toString(36)}${design.extras.length}`;

  /**
   * Where everything is, worked out by drawing the flyer off-screen.
   *
   * Off-screen rather than reading it back from the visible canvas, because
   * the boxes are needed during render — the overlay is JSX — and the visible
   * canvas is painted in an effect afterwards. Both draws run the same
   * function, so the boxes and the picture cannot drift apart.
   */
  const hits = useMemo<FlyerHit[]>(() => {
    if (typeof document === "undefined") return [];
    const canvas = document.createElement("canvas");
    canvas.width = FLYER_WIDTH;
    canvas.height = FLYER_HEIGHT;
    const ctx = canvas.getContext("2d");
    if (!ctx) return [];
    const collected: FlyerHit[] = [];
    drawProductFlyer(ctx, { data, design, image, hits: collected });
    return collected;
  }, [data, design, image]);

  // The visible flyer.
  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    ctx.clearRect(0, 0, FLYER_WIDTH, FLYER_HEIGHT);
    drawProductFlyer(ctx, { data, design, image });
  }, [data, design, image]);

  const current = hits.find((h) => h.id === selected) ?? null;
  const selectedKey = current?.kind === "text" ? current.key! : null;
  const selectedExtra =
    current?.kind === "extra" ? design.extras.find((e) => e.id === current.extraId) ?? null : null;
  const style: FlyerTextStyle | null = selectedKey
    ? design.text[selectedKey]
    : selectedExtra
      ? selectedExtra.style
      : null;

  // --- writing to the design ----------------------------------------------

  function setStyle(patch: Partial<FlyerTextStyle>) {
    if (selectedKey) {
      onChange({
        ...design,
        text: { ...design.text, [selectedKey]: { ...design.text[selectedKey], ...patch } },
      });
      return;
    }
    if (selectedExtra) {
      onChange({
        ...design,
        extras: design.extras.map((e) =>
          e.id === selectedExtra.id ? { ...e, style: { ...e.style, ...patch } } : e,
        ),
      });
    }
  }

  function setExtra(patch: Partial<FlyerExtra>) {
    if (!selectedExtra) return;
    onChange({
      ...design,
      extras: design.extras.map((e) => (e.id === selectedExtra.id ? { ...e, ...patch } : e)),
    });
  }

  function writeStyle(id: string, patch: Partial<FlyerTextStyle>) {
    if (id.startsWith("text:")) {
      const key = id.slice(5) as FlyerTextKey;
      onChange({ ...design, text: { ...design.text, [key]: { ...design.text[key], ...patch } } });
      return;
    }
    if (id.startsWith("extra:")) {
      const extraId = id.slice(6);
      onChange({
        ...design,
        extras: design.extras.map((e) =>
          e.id === extraId ? { ...e, style: { ...e.style, ...patch } } : e,
        ),
      });
    }
  }

  // --- gestures ------------------------------------------------------------
  //
  // Pointer events rather than mouse and touch separately: one code path for a
  // thumb, a trackpad and a stylus, with pointer capture so a fast drag that
  // leaves the element still reaches us.

  function toFlyer(event: React.PointerEvent): { x: number; y: number } {
    const box = event.currentTarget.getBoundingClientRect();
    return {
      x: ((event.clientX - box.left) / box.width) * FLYER_WIDTH,
      y: ((event.clientY - box.top) / box.height) * FLYER_HEIGHT,
    };
  }

  function startOf(hit: FlyerHit): Gesture["start"] {
    const base = emptyStart();
    if (hit.kind === "frame") {
      return {
        ...base,
        top: design.frame.top,
        height: design.frame.height,
        side: design.frame.side,
      };
    }
    if (hit.kind === "bar") {
      return { ...base, height: design.footer.height, bottom: design.footer.bottom };
    }
    const s =
      hit.kind === "text"
        ? design.text[hit.key!]
        : design.extras.find((e) => e.id === hit.extraId)?.style;
    if (!s) return base;
    return { ...base, dx: s.dx, dy: s.dy, size: s.size };
  }

  function applyMove(g: Gesture, dx: number, dy: number) {
    if (g.id === "frame") {
      // The picture moves down the page by its own inset, so everything under
      // it follows rather than being overlapped. Only down the page: the side
      // inset is symmetric, so dragging sideways would narrow the picture
      // rather than move it. Width is the corner handle's job.
      onChange({
        ...design,
        frame: { ...design.frame, top: Math.min(600, Math.max(0, Math.round(g.start.top + dy))) },
      });
      return;
    }
    if (g.id === "bar") {
      // Measured from the bottom edge, so dragging it down brings it closer to
      // the edge rather than further from wherever it started.
      onChange({
        ...design,
        footer: {
          ...design.footer,
          bottom: Math.min(300, Math.max(16, Math.round(g.start.bottom - dy))),
        },
      });
      return;
    }
    writeStyle(g.id, { dx: clampNudge(g.start.dx + dx), dy: clampNudge(g.start.dy + dy) });
  }

  function applyResize(g: Gesture, dx: number, dy: number) {
    if (g.id === "frame") {
      onChange({
        ...design,
        frame: {
          ...design.frame,
          height: Math.min(1000, Math.max(200, Math.round(g.start.height + dy))),
          side: Math.min(240, Math.max(0, Math.round(g.start.side - dx))),
        },
      });
      return;
    }
    if (g.id === "bar") {
      onChange({
        ...design,
        footer: {
          ...design.footer,
          height: Math.min(220, Math.max(48, Math.round(g.start.height + dy))),
        },
      });
      return;
    }
    // A corner pull in either direction grows it; 400 flyer pixels is the
    // distance that doubles a size, which reads the same on a thumb as on a
    // trackpad.
    writeStyle(g.id, { size: clampSize(g.start.size * (1 + (dx + dy) / 400)) });
  }

  function begin(event: React.PointerEvent, mode: Gesture["mode"], hit: FlyerHit) {
    const point = toFlyer(event);
    gesture.current = { mode, id: hit.id, x: point.x, y: point.y, distance: 0, start: startOf(hit) };
    event.currentTarget.setPointerCapture?.(event.pointerId);
  }

  function onPointerDown(event: React.PointerEvent) {
    pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
    setAdding(false);

    // Two fingers on something already chosen is a pinch, not a move.
    if (pointers.current.size === 2 && current?.resizable) {
      const [a, b] = [...pointers.current.values()];
      gesture.current = {
        mode: "pinch",
        id: current.id,
        x: 0,
        y: 0,
        distance: Math.hypot(a.x - b.x, a.y - b.y) || 1,
        start: startOf(current),
      };
      return;
    }

    const point = toFlyer(event);
    const hit = hitAt(hits, point.x, point.y);
    if (!hit) {
      setSelected(null);
      gesture.current = null;
      return;
    }
    setSelected(hit.id);
    if (hit.movable) begin(event, "move", hit);
  }

  function onPointerMove(event: React.PointerEvent) {
    if (pointers.current.has(event.pointerId)) {
      pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
    }
    const g = gesture.current;
    if (!g) return;

    if (g.mode === "pinch") {
      if (pointers.current.size < 2) return;
      const [a, b] = [...pointers.current.values()];
      const spread = (Math.hypot(a.x - b.x, a.y - b.y) || 1) / g.distance;
      const pull = (spread - 1) * 200;
      applyResize(g, pull, pull);
      return;
    }

    const point = toFlyer(event);
    if (g.mode === "move") applyMove(g, point.x - g.x, point.y - g.y);
    else applyResize(g, point.x - g.x, point.y - g.y);
  }

  function end(event: React.PointerEvent) {
    pointers.current.delete(event.pointerId);
    if (pointers.current.size === 0) gesture.current = null;
  }

  // --- adding, deleting, putting back --------------------------------------

  function addFeature(source: FlyerSource) {
    setAdding(false);
    if (design.extras.length >= MAX_FLYER_EXTRAS) return;
    // Each new one lands a little below the last, the way a pasted object
    // does in any editor. Dropped on exactly the same spot, a second price tag
    // looks like a rendering fault rather than a thing you just added.
    const extra = newFlyerExtra(makeId(), source);
    extra.style = { ...extra.style, dy: (design.extras.length % 6) * 46 };
    onChange({ ...design, extras: [...design.extras, extra] });
    setSelected(`extra:${extra.id}`);
  }

  function removeSelected() {
    if (selectedExtra) {
      onChange({ ...design, extras: design.extras.filter((e) => e.id !== selectedExtra.id) });
      setSelected(null);
      return;
    }
    if (selectedKey) {
      setStyle({ visible: false });
      setSelected(null);
      return;
    }
    if (current?.kind === "frame") {
      onChange({ ...design, frame: { ...design.frame, visible: false } });
      setSelected(null);
      return;
    }
    if (current?.kind === "bar") {
      onChange({ ...design, footer: { ...design.footer, visible: false } });
      setSelected(null);
    }
  }

  function duplicateSelected() {
    if (!selectedExtra || design.extras.length >= MAX_FLYER_EXTRAS) return;
    const copy = {
      ...selectedExtra,
      id: makeId(),
      style: { ...selectedExtra.style, dy: selectedExtra.style.dy + 60 },
    };
    onChange({ ...design, extras: [...design.extras, copy] });
    setSelected(`extra:${copy.id}`);
  }

  function resetSelected() {
    if (selectedKey) {
      onChange({
        ...design,
        text: { ...design.text, [selectedKey]: { ...DEFAULT_FLYER_DESIGN.text[selectedKey] } },
      });
      return;
    }
    if (selectedExtra) {
      setStyle({ dx: 0, dy: 0 });
      return;
    }
    if (current?.kind === "frame") {
      onChange({ ...design, frame: { ...DEFAULT_FLYER_DESIGN.frame } });
      return;
    }
    if (current?.kind === "bar") {
      onChange({ ...design, footer: { ...DEFAULT_FLYER_DESIGN.footer } });
    }
  }

  /** Every part of the flyer, on or off, in the order it is drawn. */
  const parts: Part[] = [
    {
      id: "frame",
      label: "The picture",
      on: design.frame.visible,
      toggle: (on) => onChange({ ...design, frame: { ...design.frame, visible: on } }),
    },
    ...FLYER_TEXT_KEYS.map((key) => ({
      id: `text:${key}`,
      label: FLYER_TEXT_LABELS[key],
      on: design.text[key].visible,
      toggle: (on: boolean) =>
        onChange({ ...design, text: { ...design.text, [key]: { ...design.text[key], visible: on } } }),
    })),
    {
      id: "bar",
      label: "The link bar",
      on: design.footer.visible,
      toggle: (on) => onChange({ ...design, footer: { ...design.footer, visible: on } }),
    },
  ];

  const off = parts.filter((p) => !p.on).length;
  const full = design.extras.length >= MAX_FLYER_EXTRAS;

  return (
    <div className={cn("space-y-2.5", className)}>
      {/* --- The flyer ------------------------------------------------- */}
      <div className="relative mx-auto w-full max-w-[420px] select-none overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-niki-edge">
        <canvas
          ref={canvasRef}
          width={FLYER_WIDTH}
          height={FLYER_HEIGHT}
          className="block w-full"
        />

        {/*
          The layer a finger actually meets. `touch-none` is what stops the
          page scrolling under a drag — without it, moving the price on a
          phone scrolls the form instead and nothing appears to work.
        */}
        <div
          role="presentation"
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={end}
          onPointerCancel={end}
          className="absolute inset-0 touch-none"
        >
          {hits.map((hit) => (
            <div
              key={hit.id}
              aria-hidden
              className={cn(
                "pointer-events-none absolute rounded-[3px] transition-[box-shadow] duration-150",
                hit.id === selected
                  ? "ring-2 ring-niki-orange"
                  : "ring-1 ring-transparent hover:ring-niki-orange/25",
              )}
              style={{
                left: `${(hit.rect.x / FLYER_WIDTH) * 100}%`,
                top: `${(hit.rect.y / FLYER_HEIGHT) * 100}%`,
                width: `${(hit.rect.width / FLYER_WIDTH) * 100}%`,
                height: `${(hit.rect.height / FLYER_HEIGHT) * 100}%`,
              }}
            />
          ))}

          {current ? (
            <>
              <span
                aria-hidden
                className="pointer-events-none absolute -translate-y-full whitespace-nowrap rounded-t-md bg-niki-orange px-1.5 py-0.5 text-[10px] font-bold leading-tight text-white"
                style={{
                  left: `${(current.rect.x / FLYER_WIDTH) * 100}%`,
                  top: `${(current.rect.y / FLYER_HEIGHT) * 100}%`,
                }}
              >
                {current.label}
              </span>

              {current.resizable ? (
                <button
                  type="button"
                  aria-label={`Resize ${current.label}`}
                  onPointerDown={(e) => {
                    e.stopPropagation();
                    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
                    begin(e, "resize", current);
                  }}
                  onPointerMove={onPointerMove}
                  onPointerUp={end}
                  onPointerCancel={end}
                  className="absolute flex h-6 w-6 items-center justify-center rounded-full bg-niki-orange text-white shadow-md ring-2 ring-white"
                  style={{
                    left: `${((current.rect.x + current.rect.width) / FLYER_WIDTH) * 100}%`,
                    top: `${((current.rect.y + current.rect.height) / FLYER_HEIGHT) * 100}%`,
                    transform: "translate(-50%, -50%)",
                    touchAction: "none",
                  }}
                >
                  <CornerRightDown className="h-3 w-3" />
                </button>
              ) : null}
            </>
          ) : null}
        </div>
      </div>

      {/* --- What the selected thing can do ----------------------------- */}
      <div className="sticky bottom-2 z-10 rounded-xl bg-white/95 shadow-sm ring-1 ring-niki-edge backdrop-blur">
        {!current ? (
          <p className="px-3 py-2.5 text-center text-xs text-niki-ink/55">
            Tap any part of the flyer to edit it. Drag to move, pull the corner or pinch to resize.
          </p>
        ) : (
          <div className="flex items-center gap-1 overflow-x-auto p-1.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            <span className="ml-1 mr-0.5 shrink-0 text-xs font-bold text-niki-ink">
              {current.label}
            </span>

            {style ? (
              <>
                <Swatch
                  value={style.color}
                  onChange={(color) => setStyle({ color })}
                  label={current.label}
                />
                <Tool label="Smaller" onClick={() => setStyle({ size: clampSize(style.size - 4) })}>
                  <Minus className="h-4 w-4" />
                </Tool>
                <span className="w-7 shrink-0 text-center font-mono text-[11px] text-niki-ink/55">
                  {style.size}
                </span>
                <Tool label="Bigger" onClick={() => setStyle({ size: clampSize(style.size + 4) })}>
                  <Plus className="h-4 w-4" />
                </Tool>
                <Divider />
                <Tool
                  label="Bold"
                  active={style.weight >= 700}
                  onClick={() => setStyle({ weight: style.weight >= 700 ? 500 : 800 })}
                >
                  <Bold className="h-4 w-4" />
                </Tool>
                <Tool
                  label="Italic"
                  active={style.italic}
                  onClick={() => setStyle({ italic: !style.italic })}
                >
                  <Italic className="h-4 w-4" />
                </Tool>
                <Tool
                  label="Capitals"
                  active={style.uppercase}
                  onClick={() => setStyle({ uppercase: !style.uppercase })}
                >
                  <span className="text-[11px] font-bold">AA</span>
                </Tool>
                <select
                  value={style.font}
                  onChange={(e) => setStyle({ font: e.target.value as FlyerFontKey })}
                  aria-label={`Typeface of ${current.label}`}
                  className="h-9 shrink-0 rounded-lg border-0 bg-niki-surface px-2 text-xs font-semibold text-niki-ink/75 outline-none"
                >
                  {FLYER_FONTS.map((f) => (
                    <option key={f.key} value={f.key}>
                      {f.label}
                    </option>
                  ))}
                </select>
              </>
            ) : null}

            {current.kind === "bar" ? (
              <>
                <Swatch
                  value={design.colours.accent}
                  onChange={(accent) => onChange({ ...design, colours: { ...design.colours, accent } })}
                  label="the bar"
                />
                <Stepper
                  label="Height"
                  value={design.footer.height}
                  onChange={(height) =>
                    onChange({ ...design, footer: { ...design.footer, height } })
                  }
                  min={48}
                  max={220}
                  step={8}
                />
                <Stepper
                  label="Corners"
                  value={design.footer.radius}
                  onChange={(radius) =>
                    onChange({ ...design, footer: { ...design.footer, radius } })
                  }
                  min={0}
                  max={110}
                  step={4}
                />
              </>
            ) : null}

            {current.kind === "frame" ? (
              <Stepper
                label="Corners"
                value={design.frame.radius}
                onChange={(radius) => onChange({ ...design, frame: { ...design.frame, radius } })}
                min={0}
                max={160}
                step={4}
              />
            ) : null}

            {selectedExtra ? (
              <>
                <Divider />
                {FLYER_ALIGNMENTS.map((a) => (
                  <Tool
                    key={a.key}
                    label={a.label}
                    active={selectedExtra.align === a.key}
                    onClick={() => setExtra({ align: a.key as FlyerAlign })}
                  >
                    {a.key === "left" ? (
                      <AlignLeft className="h-4 w-4" />
                    ) : a.key === "center" ? (
                      <AlignCenter className="h-4 w-4" />
                    ) : (
                      <AlignRight className="h-4 w-4" />
                    )}
                  </Tool>
                ))}
                <Tool label="Add another like this" onClick={duplicateSelected}>
                  <Copy className="h-4 w-4" />
                </Tool>
              </>
            ) : null}

            <Divider />
            <Tool label="Put it back as it was" onClick={resetSelected}>
              <RotateCcw className="h-4 w-4" />
            </Tool>
            <Tool label="Delete" tone="danger" onClick={removeSelected}>
              <Trash2 className="h-4 w-4" />
            </Tool>

            {selectedExtra?.source === "custom" ? (
              <input
                value={selectedExtra.text}
                onChange={(e) => setExtra({ text: e.target.value.slice(0, 80) })}
                maxLength={80}
                placeholder="Your words"
                aria-label="The words on this line"
                className="ml-1 h-9 min-w-[9rem] flex-1 rounded-lg border border-niki-edge-strong px-2.5 text-sm text-niki-ink outline-none focus:border-niki-orange"
              />
            ) : null}
          </div>
        )}
      </div>

      {/* --- The parts, and how to add one ------------------------------ */}
      <div className="relative flex items-start gap-2">
        <div className="flex min-w-0 flex-1 gap-1.5 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {parts.map((part) => (
            <button
              key={part.id}
              type="button"
              onClick={() => {
                if (!part.on) part.toggle(true);
                setSelected(part.id);
              }}
              title={part.on ? `Edit ${part.label.toLowerCase()}` : "Deleted — tap to put it back"}
              className={cn(
                "niki-press shrink-0 rounded-lg px-2.5 py-1.5 text-xs font-semibold ring-1 transition-colors",
                selected === part.id
                  ? "bg-niki-orange text-white ring-niki-orange"
                  : part.on
                    ? "bg-white text-niki-ink/70 ring-niki-edge-strong hover:bg-niki-surface"
                    : "bg-niki-surface text-niki-ink/35 ring-niki-edge line-through",
              )}
            >
              {part.label}
            </button>
          ))}

          {design.extras.map((extra) => (
            <button
              key={extra.id}
              type="button"
              onClick={() => setSelected(`extra:${extra.id}`)}
              className={cn(
                "niki-press inline-flex max-w-[11rem] shrink-0 items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-semibold ring-1 transition-colors",
                selected === `extra:${extra.id}`
                  ? "bg-niki-orange text-white ring-niki-orange"
                  : "bg-white text-niki-ink/70 ring-niki-edge-strong hover:bg-niki-surface",
              )}
            >
              <Type className="h-3 w-3 shrink-0" />
              <span className="truncate">
                {extra.source === "custom"
                  ? extra.text || "Your line"
                  : `${FLYER_TEXT_LABELS[extra.source]} 2`}
              </span>
            </button>
          ))}
        </div>

        <button
          type="button"
          onClick={() => setAdding((v) => !v)}
          disabled={full}
          aria-expanded={adding}
          className="niki-press inline-flex shrink-0 items-center gap-1 rounded-lg bg-niki-ink px-3 py-1.5 text-xs font-semibold text-white hover:bg-niki-ink/90 disabled:cursor-not-allowed disabled:opacity-40"
          title={full ? `${MAX_FLYER_EXTRAS} added features is the most a flyer carries` : "Add a feature"}
        >
          {adding ? <X className="h-3.5 w-3.5" /> : <Plus className="h-3.5 w-3.5" />}
          Add
        </button>

        {adding ? (
          <>
            <button
              type="button"
              aria-label="Close"
              onClick={() => setAdding(false)}
              className="fixed inset-0 z-20 cursor-default"
            />
            <div className="absolute right-0 top-9 z-30 w-56 overflow-hidden rounded-xl bg-white shadow-lg ring-1 ring-niki-edge">
              <p className="border-b border-niki-edge px-3 py-2 text-[11px] font-semibold text-niki-ink/50">
                Add to the flyer
              </p>
              <ul className="max-h-72 overflow-y-auto py-1">
                {FLYER_SOURCES.map((source) => (
                  <li key={source.key}>
                    <button
                      type="button"
                      onClick={() => addFeature(source.key as FlyerSource)}
                      className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs font-semibold text-niki-ink/75 hover:bg-niki-surface"
                    >
                      {source.key === "custom" ? (
                        <Type className="h-3.5 w-3.5 text-niki-orange" />
                      ) : source.key === "link" ? (
                        <Link2 className="h-3.5 w-3.5 text-niki-ink/35" />
                      ) : (
                        <ImageIcon className="h-3.5 w-3.5 text-niki-ink/35" />
                      )}
                      {source.label}
                    </button>
                  </li>
                ))}
              </ul>
              <p className="border-t border-niki-edge px-3 py-2 text-[11px] leading-relaxed text-niki-ink/45">
                Anything but your own words follows the product, so a second price tag is still the
                price.
              </p>
            </div>
          </>
        ) : null}
      </div>

      {off > 0 ? (
        <p className="text-[11px] text-niki-ink/45">
          {off} part{off === 1 ? "" : "s"} deleted. Tap a crossed-out one to put it back.
        </p>
      ) : null}
    </div>
  );
}

/** One square button in the contextual row. */
function Tool({
  label,
  onClick,
  active = false,
  tone = "plain",
  children,
}: {
  label: string;
  onClick: () => void;
  active?: boolean;
  tone?: "plain" | "danger";
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={label}
      aria-label={label}
      aria-pressed={active}
      className={cn(
        "niki-press flex h-9 w-9 shrink-0 items-center justify-center rounded-lg transition-colors",
        tone === "danger"
          ? "text-niki-danger hover:bg-niki-danger/10"
          : active
            ? "bg-niki-orange text-white"
            : "text-niki-ink/70 hover:bg-niki-surface",
      )}
    >
      {children}
    </button>
  );
}

/** A colour well that opens the device's own picker. */
function Swatch({
  value,
  onChange,
  label,
}: {
  value: string;
  onChange: (colour: string) => void;
  label: string;
}) {
  return (
    <label
      className="niki-press relative flex h-9 w-9 shrink-0 cursor-pointer items-center justify-center rounded-lg hover:bg-niki-surface"
      title="Colour"
    >
      <span
        className="h-4 w-4 rounded-full ring-1 ring-black/15"
        style={{ background: value || "#9ca3af" }}
      />
      <input
        type="color"
        value={value || "#111827"}
        onChange={(e) => onChange(e.target.value)}
        className="absolute inset-0 cursor-pointer opacity-0"
        aria-label={`Colour of ${label}`}
      />
    </label>
  );
}

/** A labelled −/+ pair, for the few things with no handle of their own. */
function Stepper({
  label,
  value,
  onChange,
  min,
  max,
  step,
}: {
  label: string;
  value: number;
  onChange: (next: number) => void;
  min: number;
  max: number;
  step: number;
}) {
  const set = (next: number) => onChange(Math.min(max, Math.max(min, next)));
  return (
    <span className="flex shrink-0 items-center gap-0.5 rounded-lg bg-niki-surface px-1">
      <span className="px-1 text-[11px] font-semibold text-niki-ink/55">{label}</span>
      <Tool label={`Less ${label.toLowerCase()}`} onClick={() => set(value - step)}>
        <Minus className="h-3.5 w-3.5" />
      </Tool>
      <Tool label={`More ${label.toLowerCase()}`} onClick={() => set(value + step)}>
        <Plus className="h-3.5 w-3.5" />
      </Tool>
    </span>
  );
}

function Divider() {
  return <span aria-hidden className="mx-0.5 h-5 w-px shrink-0 bg-niki-edge" />;
}
