"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ALargeSmall,
  AlignCenter,
  AlignLeft,
  AlignRight,
  Bold,
  Copy,
  Eye,
  EyeOff,
  Italic,
  Move,
  Plus,
  RotateCcw,
  Trash2,
  Type,
} from "lucide-react";
import {
  clampNudge,
  clampSize,
  DEFAULT_FLYER_DESIGN,
  drawProductFlyer,
  FLYER_ALIGNMENTS,
  FLYER_HEIGHT,
  FLYER_TEXT_KEYS,
  FLYER_TEXT_LABELS,
  FLYER_WIDTH,
  MAX_FLYER_EXTRAS,
  hitAt,
  newFlyerExtra,
  type FlyerAlign,
  type FlyerDesign,
  type FlyerHit,
  type FlyerImage,
  type FlyerTextKey,
  type ProductFlyerData,
} from "@/lib/affiliate-flyer";
import { cn } from "@/lib/cn";

/**
 * The flyer, edited by touching it.
 *
 * The first version of this put every property behind a slider in a panel
 * under the preview: to move the price you scrolled past the flyer, found
 * "Price", dragged "Nudge across", scrolled back up to see what happened.
 * Nobody edits a picture that way, and the parts you could add or remove were
 * so far down the page that people reasonably concluded they did not exist.
 *
 * So the flyer is the editor. Tap a thing to select it, drag it to move it,
 * pull its corner or pinch to resize it, and the row under the canvas changes
 * to the handful of controls that thing actually has. Nothing moves more than
 * the design can store, because the drag writes the same bounded nudge the
 * slider did — which is what keeps a finger from producing a flyer with the
 * price off the bottom edge.
 *
 * The chips below are not decoration: an element that has been switched off
 * draws nothing, so it has no box to tap, and without a list of the parts
 * there would be no way back. They are also how somebody discovers that the
 * eleven things on the flyer are each theirs to change.
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
  start: { dx: number; dy: number; size: number; top: number; height: number; side: number };
}

const HANDLE = 44; // A touch target, not a dot — this is used with a thumb.

function emptyStart(): Gesture["start"] {
  return { dx: 0, dy: 0, size: 0, top: 0, height: 0, side: 0 };
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
  const gesture = useRef<Gesture | null>(null);
  const pointers = useRef(new Map<number, { x: number; y: number }>());

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

  // --- writing to the design ----------------------------------------------

  const setStyle = useCallback(
    (patch: Partial<FlyerDesign["text"][FlyerTextKey]>) => {
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
    },
    [design, onChange, selectedKey, selectedExtra],
  );

  const setExtra = useCallback(
    (patch: Partial<(typeof design.extras)[number]>) => {
      if (!selectedExtra) return;
      onChange({
        ...design,
        extras: design.extras.map((e) => (e.id === selectedExtra.id ? { ...e, ...patch } : e)),
      });
    },
    [design, onChange, selectedExtra],
  );

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
    const s =
      hit.kind === "text"
        ? design.text[hit.key!]
        : design.extras.find((e) => e.id === hit.extraId)?.style;
    if (!s) return base;
    return { ...base, dx: s.dx, dy: s.dy, size: s.size };
  }

  function writeStyle(id: string, patch: Partial<FlyerDesign["text"][FlyerTextKey]>) {
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

  function applyMove(g: Gesture, dx: number, dy: number) {
    if (g.id === "frame") {
      // The picture moves down the page by its own inset, so everything under
      // it follows rather than being overlapped. Only down the page: the side
      // inset is symmetric, so dragging sideways would narrow the picture
      // rather than move it, which is not what a sideways drag means. Width is
      // the corner handle's job.
      onChange({
        ...design,
        frame: { ...design.frame, top: Math.min(600, Math.max(0, Math.round(g.start.top + dy))) },
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

  // --- adding and removing -------------------------------------------------

  const addLine = useCallback(() => {
    if (design.extras.length >= MAX_FLYER_EXTRAS) return;
    const extra = newFlyerExtra(`x${Date.now().toString(36)}`);
    onChange({ ...design, extras: [...design.extras, extra] });
    setSelected(`extra:${extra.id}`);
  }, [design, onChange]);

  const removeSelected = useCallback(() => {
    if (selectedExtra) {
      onChange({ ...design, extras: design.extras.filter((e) => e.id !== selectedExtra.id) });
      setSelected(null);
      return;
    }
    // The eleven built-in parts cannot be deleted — they are what a flyer is —
    // so taking one away means switching it off, which is reversible from the
    // chips below.
    if (selectedKey) setStyle({ visible: false });
  }, [design, onChange, selectedExtra, selectedKey, setStyle]);

  const duplicateSelected = useCallback(() => {
    if (!selectedExtra || design.extras.length >= MAX_FLYER_EXTRAS) return;
    const copy = {
      ...selectedExtra,
      id: `x${Date.now().toString(36)}`,
      style: { ...selectedExtra.style, dy: selectedExtra.style.dy + 60 },
    };
    onChange({ ...design, extras: [...design.extras, copy] });
    setSelected(`extra:${copy.id}`);
  }, [design, onChange, selectedExtra]);

  const resetSelected = useCallback(() => {
    if (selectedKey) {
      onChange({
        ...design,
        text: { ...design.text, [selectedKey]: { ...DEFAULT_FLYER_DESIGN.text[selectedKey] } },
      });
      return;
    }
    if (selectedExtra) {
      setStyle({ dx: 0, dy: 0, size: 28 });
      return;
    }
    if (current?.kind === "frame") {
      onChange({ ...design, frame: { ...DEFAULT_FLYER_DESIGN.frame } });
    }
  }, [current, design, onChange, selectedExtra, selectedKey, setStyle]);

  const style = selectedKey
    ? design.text[selectedKey]
    : selectedExtra
      ? selectedExtra.style
      : null;

  const hiddenKeys = FLYER_TEXT_KEYS.filter((k) => !design.text[k].visible);

  return (
    <div className={cn("space-y-3", className)}>
      <div className="relative mx-auto w-full max-w-[420px] select-none">
        <canvas
          ref={canvasRef}
          width={FLYER_WIDTH}
          height={FLYER_HEIGHT}
          className="block w-full rounded-2xl shadow-sm ring-1 ring-niki-edge"
        />

        {/*
          The layer a finger actually meets. `touch-none` is what stops the
          page scrolling under a drag — without it, moving the price on a phone
          scrolls the form instead and nothing appears to work.
        */}
        <div
          role="presentation"
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={end}
          onPointerCancel={end}
          className="absolute inset-0 touch-none"
        >
          {hits.map((hit) => {
            const active = hit.id === selected;
            return (
              <div
                key={hit.id}
                aria-hidden
                className={cn(
                  "pointer-events-none absolute rounded-md transition-colors",
                  active
                    ? "ring-2 ring-niki-orange"
                    : "ring-1 ring-transparent hover:ring-niki-orange/30",
                )}
                style={{
                  left: `${(hit.rect.x / FLYER_WIDTH) * 100}%`,
                  top: `${(hit.rect.y / FLYER_HEIGHT) * 100}%`,
                  width: `${(hit.rect.width / FLYER_WIDTH) * 100}%`,
                  height: `${(hit.rect.height / FLYER_HEIGHT) * 100}%`,
                }}
              />
            );
          })}

          {current ? (
            <>
              <span
                aria-hidden
                className="pointer-events-none absolute -translate-y-full rounded-md bg-niki-orange px-1.5 py-0.5 text-[10px] font-bold text-white"
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
                  className="absolute flex items-center justify-center rounded-full bg-niki-orange text-white shadow-md ring-2 ring-white"
                  style={{
                    left: `${((current.rect.x + current.rect.width) / FLYER_WIDTH) * 100}%`,
                    top: `${((current.rect.y + current.rect.height) / FLYER_HEIGHT) * 100}%`,
                    width: HANDLE / 2,
                    height: HANDLE / 2,
                    transform: "translate(-50%, -50%)",
                    touchAction: "none",
                  }}
                >
                  <Move className="h-3 w-3" />
                </button>
              ) : null}
            </>
          ) : null}
        </div>
      </div>

      {/*
        The controls, directly under the picture rather than down the page.
        What is here depends on what is selected, which is the only way a row
        this short can cover eleven elements plus whatever has been added.
      */}
      <div className="sticky bottom-2 z-10 rounded-2xl bg-white/95 p-2.5 shadow-sm ring-1 ring-niki-edge backdrop-blur">
        {!current ? (
          <p className="px-1 py-1.5 text-center text-xs text-niki-ink/55">
            Tap anything on the flyer to edit it — drag to move, pull the corner or pinch to
            resize.
          </p>
        ) : (
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="mr-1 shrink-0 text-xs font-bold text-niki-ink">{current.label}</span>

            {style ? (
              <>
                <label
                  className="niki-press relative flex h-9 w-9 cursor-pointer items-center justify-center rounded-lg ring-1 ring-niki-edge-strong"
                  title="Colour"
                >
                  <span
                    className="h-4 w-4 rounded-full ring-1 ring-black/10"
                    style={{ background: style.color || "#9ca3af" }}
                  />
                  <input
                    type="color"
                    value={style.color || "#111827"}
                    onChange={(e) => setStyle({ color: e.target.value })}
                    className="absolute inset-0 cursor-pointer opacity-0"
                    aria-label={`Colour of ${current.label}`}
                  />
                </label>

                <Tool
                  label="Smaller"
                  onClick={() => setStyle({ size: clampSize(style.size - 4) })}
                >
                  <ALargeSmall className="h-4 w-4" />
                </Tool>
                <span className="w-8 text-center font-mono text-[11px] text-niki-ink/55">
                  {style.size}
                </span>
                <Tool label="Bigger" onClick={() => setStyle({ size: clampSize(style.size + 4) })}>
                  <Type className="h-4 w-4" />
                </Tool>

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
              </>
            ) : null}

            {selectedExtra ? (
              <>
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
                <Tool label="Duplicate" onClick={duplicateSelected}>
                  <Copy className="h-4 w-4" />
                </Tool>
              </>
            ) : null}

            <Tool label="Put it back" onClick={resetSelected}>
              <RotateCcw className="h-4 w-4" />
            </Tool>
            <Tool
              label={selectedExtra ? "Delete" : "Hide"}
              tone="danger"
              onClick={removeSelected}
            >
              {selectedExtra ? <Trash2 className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
            </Tool>

            {selectedExtra ? (
              <input
                value={selectedExtra.text}
                onChange={(e) => setExtra({ text: e.target.value.slice(0, 80) })}
                maxLength={80}
                placeholder="Your words"
                aria-label="The words on this line"
                className="min-w-[8rem] flex-1 rounded-lg border border-niki-edge-strong px-2.5 py-1.5 text-sm text-niki-ink outline-none focus:border-niki-orange"
              />
            ) : null}
          </div>
        )}
      </div>

      {/* The parts list: how you reach something you switched off, and how
          anybody finds out these are all theirs to change. */}
      <div className="flex flex-wrap items-center gap-1.5">
        {FLYER_TEXT_KEYS.map((key) => {
          const on = design.text[key].visible;
          const active = selected === `text:${key}`;
          return (
            <button
              key={key}
              type="button"
              onClick={() => {
                setSelected(`text:${key}`);
                if (!on) {
                  onChange({
                    ...design,
                    text: { ...design.text, [key]: { ...design.text[key], visible: true } },
                  });
                }
              }}
              className={cn(
                "niki-press inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-semibold ring-1 transition-colors",
                active
                  ? "bg-niki-orange text-white ring-niki-orange"
                  : on
                    ? "bg-white text-niki-ink/70 ring-niki-edge-strong hover:bg-niki-surface"
                    : "bg-niki-surface text-niki-ink/35 ring-niki-edge",
              )}
              title={on ? `Edit the ${FLYER_TEXT_LABELS[key].toLowerCase()}` : "Switched off — tap to bring it back"}
            >
              {on ? <Eye className="h-3 w-3" /> : <EyeOff className="h-3 w-3" />}
              <span className={cn(!on && "line-through")}>{FLYER_TEXT_LABELS[key]}</span>
            </button>
          );
        })}

        {design.extras.map((extra) => (
          <button
            key={extra.id}
            type="button"
            onClick={() => setSelected(`extra:${extra.id}`)}
            className={cn(
              "niki-press inline-flex max-w-[12rem] items-center gap-1 truncate rounded-lg px-2.5 py-1.5 text-xs font-semibold ring-1 transition-colors",
              selected === `extra:${extra.id}`
                ? "bg-niki-orange text-white ring-niki-orange"
                : "bg-white text-niki-ink/70 ring-niki-edge-strong hover:bg-niki-surface",
            )}
          >
            <Type className="h-3 w-3 shrink-0" />
            <span className="truncate">{extra.text || "Your line"}</span>
          </button>
        ))}

        <button
          type="button"
          onClick={addLine}
          disabled={design.extras.length >= MAX_FLYER_EXTRAS}
          className="niki-press inline-flex items-center gap-1 rounded-lg bg-niki-ink px-2.5 py-1.5 text-xs font-semibold text-white hover:bg-niki-ink/90 disabled:cursor-not-allowed disabled:opacity-40"
          title={
            design.extras.length >= MAX_FLYER_EXTRAS
              ? `Four added lines is the most a flyer can carry`
              : "Add a line of your own"
          }
        >
          <Plus className="h-3 w-3" />
          Add a line
        </button>
      </div>

      {hiddenKeys.length > 0 ? (
        <p className="text-[11px] text-niki-ink/45">
          {hiddenKeys.length} part{hiddenKeys.length === 1 ? "" : "s"} switched off. Tap a crossed-out
          chip to bring one back.
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
        "niki-press flex h-9 w-9 items-center justify-center rounded-lg ring-1 transition-colors",
        tone === "danger"
          ? "text-niki-danger ring-niki-danger/30 hover:bg-niki-danger/10"
          : active
            ? "bg-niki-orange text-white ring-niki-orange"
            : "text-niki-ink/70 ring-niki-edge-strong hover:bg-niki-surface",
      )}
    >
      {children}
    </button>
  );
}
