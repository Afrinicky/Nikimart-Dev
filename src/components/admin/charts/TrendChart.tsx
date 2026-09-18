"use client";

import { useState } from "react";
import { cn } from "@/lib/cn";

/**
 * One measure over the window, as an area with a crosshair.
 *
 * A single series, so no legend — the heading says what is plotted, and a box
 * with one swatch in it would only restate that. The fill is a wash rather
 * than a block: it is there to show the shape, and the numbers that matter are
 * printed above it and in the tooltip.
 *
 * Every day in the window is a point, including the ones that sold nothing.
 * Drawing only the days that traded compresses a quiet week into a single step
 * and turns a dip into a plateau, which is the one thing a trend must not do.
 *
 * The plot is stretched to its container rather than letterboxed inside it, so
 * the marks keep their real thickness through `vector-effect` and the end
 * markers sit in an overlay — a circle inside a stretched viewBox is an
 * ellipse, and a squashed dot reads as a rendering fault.
 */

export interface TrendPoint {
  day: string;
  /** What is plotted. */
  value: number;
  /**
   * The same figure, already formatted. Formatted on the server rather than
   * here because a formatter is a function, and a function cannot cross from a
   * server component into a client one — handing one over throws at render,
   * which is exactly what it did the first time this shipped.
   */
  label: string;
  /** A second figure for the tooltip, e.g. how many orders made that revenue. */
  count: number;
}

const W = 720;
const H = 180;
const PAD = { top: 12, bottom: 12 };

export function TrendChart({ points, countLabel }: { points: TrendPoint[]; countLabel: string }) {
  const [hover, setHover] = useState<number | null>(null);

  if (points.length === 0) return null;

  const max = Math.max(...points.map((p) => p.value), 1);
  const innerH = H - PAD.top - PAD.bottom;
  const x = (i: number) => (points.length === 1 ? W / 2 : (i / (points.length - 1)) * W);
  const y = (v: number) => PAD.top + innerH - (v / max) * innerH;

  const line = points.map((p, i) => `${i === 0 ? "M" : "L"}${x(i)},${y(p.value)}`).join(" ");
  const area = `${line} L${x(points.length - 1)},${H} L${x(0)},${H} Z`;

  const active = hover === null ? null : points[hover];
  const peak = points.reduce((best, p, i) => (p.value > points[best].value ? i : best), 0);
  const marked = [points.length - 1, peak, hover ?? -1].filter(
    (i, idx, all) => i >= 0 && all.indexOf(i) === idx,
  );

  return (
    <div className="relative">
      <div className="relative h-44 w-full" onMouseLeave={() => setHover(null)}>
        <svg
          viewBox={`0 0 ${W} ${H}`}
          preserveAspectRatio="none"
          className="h-full w-full"
          role="img"
          aria-label={`Daily trend over ${points.length} days`}
        >
          {/* Recessive baseline and midline. Hairline, solid, one step off the
              surface — enough to read a height against, not to look at. */}
          {[0, 0.5, 1].map((t) => (
            <line
              key={t}
              x1={0}
              x2={W}
              y1={PAD.top + innerH * t}
              y2={PAD.top + innerH * t}
              stroke="var(--color-niki-edge)"
              strokeWidth={1}
              vectorEffect="non-scaling-stroke"
            />
          ))}

          <path d={area} fill="var(--color-niki-orange)" fillOpacity={0.1} />
          <path
            d={line}
            fill="none"
            stroke="var(--color-niki-orange)"
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
            vectorEffect="non-scaling-stroke"
          />

          {active ? (
            <line
              x1={x(hover!)}
              x2={x(hover!)}
              y1={PAD.top}
              y2={H}
              stroke="var(--color-niki-ink)"
              strokeOpacity={0.25}
              strokeWidth={1}
              vectorEffect="non-scaling-stroke"
            />
          ) : null}

          {/* Hit targets: a full-height band per day, so the crosshair catches
              a cursor anywhere in the column rather than only on the mark. */}
          {points.map((p, i) => (
            <rect
              key={p.day}
              x={x(i) - W / points.length / 2}
              y={0}
              width={W / points.length}
              height={H}
              fill="transparent"
              onMouseEnter={() => setHover(i)}
            />
          ))}
        </svg>

        {/* The end point is always marked, and the peak when it isn't the end:
            two markers, never a number on every day. */}
        {marked.map((i) => (
          <span
            key={i}
            aria-hidden
            className="pointer-events-none absolute h-2 w-2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-niki-orange ring-2 ring-white"
            style={{ left: `${(x(i) / W) * 100}%`, top: `${(y(points[i].value) / H) * 100}%` }}
          />
        ))}
      </div>

      <div className="mt-1 flex items-center justify-between px-1 text-[11px] text-niki-ink/40">
        <span>{shortDay(points[0].day)}</span>
        <span>{shortDay(points[points.length - 1].day)}</span>
      </div>

      {active ? (
        <div
          className={cn(
            "pointer-events-none absolute top-0 rounded-xl bg-niki-black px-3 py-2 text-xs text-white shadow-lg",
            hover! > points.length / 2 ? "left-2" : "right-2",
          )}
        >
          <p className="font-semibold">{longDay(active.day)}</p>
          <p className="font-figures text-sm font-bold">{active.label}</p>
          <p className="text-white/60">
            {active.count} {countLabel}
          </p>
        </div>
      ) : null}
    </div>
  );
}

function shortDay(iso: string): string {
  const [, m, d] = iso.split("-");
  return `${d} ${MONTHS[Number(m) - 1]}`;
}

function longDay(iso: string): string {
  const [y, m, d] = iso.split("-");
  return `${d} ${MONTHS[Number(m) - 1]} ${y}`;
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
