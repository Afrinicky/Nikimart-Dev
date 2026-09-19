"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/cn";

/**
 * One measure over the window, as an area with a crosshair.
 *
 * A single series, so no legend — the heading says what is plotted, and a box
 * with one swatch in it would only restate that. The fill is a wash rather
 * than a block: it is there to show the shape, and the numbers that matter are
 * printed above it and in the tooltip.
 *
 * Every stretch of the window is a point, including the ones that sold nothing.
 * Drawing only the days that traded compresses a quiet week into a single step
 * and turns a dip into a plateau, which is the one thing a trend must not do.
 * Long windows arrive bucketed into weeks or months rather than as hundreds of
 * one-pixel days, and a bucketed point says its span in the tooltip.
 *
 * The plot is stretched to its container rather than letterboxed inside it, so
 * the marks keep their real thickness through `vector-effect` and the end
 * markers sit in an overlay — a circle inside a stretched viewBox is an
 * ellipse, and a squashed dot reads as a rendering fault.
 */

export interface TrendPoint {
  day: string;
  /**
   * The last day this point covers, when it covers more than one.
   *
   * A window of two years drawn as daily points is a mark a pixel wide that
   * nothing can hover, so long windows arrive already bucketed into weeks or
   * months. The tooltip then has to say so — a point labelled "1 Mar" that is
   * really the whole of March is a figure read wrong.
   */
  endDay?: string;
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
  /**
   * Where this point's figures come from. Given, the column is clickable and
   * opens them — a number you can see the shape of but not get behind is only
   * half a chart.
   */
  href?: string;
}

const W = 720;
const H = 180;
const PAD = { top: 12, bottom: 12 };

export function TrendChart({ points, countLabel }: { points: TrendPoint[]; countLabel: string }) {
  const router = useRouter();
  const [hover, setHover] = useState<number | null>(null);

  if (points.length === 0) return null;

  const max = Math.max(...points.map((p) => p.value), 1);
  const innerH = H - PAD.top - PAD.bottom;
  const x = (i: number) => (points.length === 1 ? W / 2 : (i / (points.length - 1)) * W);
  const y = (v: number) => PAD.top + innerH - (v / max) * innerH;

  /**
   * The hovered index, but only while it still names a point.
   *
   * Clicking a point navigates, and the chart it lands on is the same
   * component in the same place — so React keeps this state while `points`
   * is replaced underneath it. A day picked out of a month leaves an index of
   * 12 pointing into an array of one, and everything downstream reads
   * `points[12].value` off undefined. Derived rather than reset in an effect,
   * because the bad render is the one that happens before an effect could run.
   */
  const hovered = hover !== null && hover >= 0 && hover < points.length ? hover : null;

  // A window of one day is a level, not a slope: drawn as a point alone it is
  // a dot in an empty box that reads as a chart that failed to load.
  const line =
    points.length === 1
      ? `M0,${y(points[0].value)} L${W},${y(points[0].value)}`
      : points.map((p, i) => `${i === 0 ? "M" : "L"}${x(i)},${y(p.value)}`).join(" ");
  const area =
    points.length === 1
      ? `${line} L${W},${H} L0,${H} Z`
      : `${line} L${x(points.length - 1)},${H} L${x(0)},${H} Z`;

  const active = hovered === null ? null : points[hovered];
  const peak = points.reduce((best, p, i) => (p.value > points[best].value ? i : best), 0);
  const marked = [points.length - 1, peak, hovered ?? -1].filter(
    (i, idx, all) => i >= 0 && i < points.length && all.indexOf(i) === idx,
  );

  return (
    <div className="relative">
      <div className="relative h-44 w-full" onMouseLeave={() => setHover(null)}>
        <svg
          viewBox={`0 0 ${W} ${H}`}
          preserveAspectRatio="none"
          className="h-full w-full"
          role="img"
          aria-label={`Trend over ${points.length} points`}
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
              x1={x(hovered!)}
              x2={x(hovered!)}
              y1={PAD.top}
              y2={H}
              stroke="var(--color-niki-ink)"
              strokeOpacity={0.25}
              strokeWidth={1}
              vectorEffect="non-scaling-stroke"
            />
          ) : null}

          {/* Hit targets: a full-height band per day, so the crosshair catches
              a cursor anywhere in the column rather than only on the mark — and
              so a click lands on the column rather than on a two-pixel dot. */}
          {points.map((p, i) => (
            <rect
              key={p.day}
              x={x(i) - W / points.length / 2}
              y={0}
              width={W / points.length}
              height={H}
              fill="transparent"
              className={p.href ? "cursor-pointer" : undefined}
              onMouseEnter={() => setHover(i)}
              onClick={p.href ? () => router.push(p.href!) : undefined}
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

        {/* The tooltip sits on the point it is describing. Parked in a corner it
            reads as a caption for the whole chart, and the crosshair becomes the
            only thing saying which day you are actually looking at.

            It flips below the mark near the top of the plot rather than running
            up over the panel's own heading, and `clamp` keeps it inside the
            chart at either end — a tooltip half off the screen is worse than one
            slightly off-centre. */}
        {active ? (
          <div
            className={cn(
              "pointer-events-none absolute z-10 w-max max-w-[calc(100%-1rem)] -translate-x-1/2 rounded-xl bg-niki-black px-3 py-2 text-xs text-white shadow-lg",
              y(active.value) > H * 0.42
                ? "-translate-y-[calc(100%+0.6rem)]"
                : "translate-y-[0.6rem]",
            )}
            style={{
              left: `clamp(5.75rem, ${(x(hovered!) / W) * 100}%, calc(100% - 5.75rem))`,
              top: `${(y(active.value) / H) * 100}%`,
            }}
          >
            <p className="font-semibold">
              {active.endDay && active.endDay !== active.day
                ? spanOfDays(active.day, active.endDay)
                : longDay(active.day)}
            </p>
            <p className="font-figures text-sm font-bold">{active.label}</p>
            <p className="text-white/60">
              {active.count} {countLabel}
            </p>
          </div>
        ) : null}
      </div>

      <div className="mt-1 flex items-center justify-between px-1 text-[11px] text-niki-ink/40">
        <span>{shortDay(points[0].day)}</span>
        <span>{shortDay(points[points.length - 1].day)}</span>
      </div>
    </div>
  );
}

function shortDay(iso: string): string {
  const [, m, d] = iso.split("-");
  return `${d} ${MONTHS[Number(m) - 1]}`;
}

/** "1–7 Mar 2026", "28 Feb – 6 Mar 2026". */
function spanOfDays(from: string, to: string): string {
  const [fy, fm, fd] = from.split("-");
  const [ty, tm, td] = to.split("-");
  const left =
    fy === ty && fm === tm
      ? String(Number(fd))
      : `${Number(fd)} ${MONTHS[Number(fm) - 1]}${fy === ty ? "" : ` ${fy}`}`;
  const joiner = fy === ty && fm === tm ? "–" : " – ";
  return `${left}${joiner}${Number(td)} ${MONTHS[Number(tm) - 1]} ${ty}`;
}

function longDay(iso: string): string {
  const [y, m, d] = iso.split("-");
  return `${d} ${MONTHS[Number(m) - 1]} ${y}`;
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
