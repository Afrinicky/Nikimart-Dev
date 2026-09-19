"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { CalendarRange } from "lucide-react";
import { ActionLink } from "@/components/ui/motion";
import { inputClass } from "@/components/ui/Field";
import { cn } from "@/lib/cn";

/**
 * The stretch of time the team is measured over.
 *
 * Today, a week, a month and all time as presets, because those are the four
 * questions a leader actually asks — who sold today, who is having a good
 * week, who is carrying the month, and who has ever done anything. A pair of
 * dates covers the rest.
 *
 * The presets stay plain links so a leader can keep "this week" open on a
 * second screen; the date range opens rather than navigates, because picking
 * one is two decisions and a row of pills is one.
 */

const PRESETS = [
  { key: "today", label: "Today" },
  { key: "7", label: "7 days" },
  { key: "30", label: "30 days" },
  { key: "all", label: "All time" },
] as const;

export function TeamRange({
  active,
  label,
  from,
  to,
  today,
}: {
  /** Which pill is lit: "today" | "7" | "30" | "all" | "custom". */
  active: string;
  label: string;
  from: string;
  to: string;
  /** Today's date, worked out on the server so both halves agree. */
  today: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [start, setStart] = useState(from);
  const [end, setEnd] = useState(to);
  const wrap = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onDown(e: MouseEvent) {
      if (!wrap.current?.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  function apply(e: React.FormEvent) {
    e.preventDefault();
    if (!start || !end) return;
    setOpen(false);
    router.push(`/agent/team?from=${start}&to=${end}`);
  }

  const href = (key: string) =>
    key === "today" ? `/agent/team?from=${today}&to=${today}` : `/agent/team?days=${key}`;

  const pill =
    "niki-focus rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors whitespace-nowrap";
  const on = "bg-niki-black text-white";
  const off = "bg-white text-niki-ink/60 ring-1 ring-niki-edge hover:text-niki-ink";

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <span className="mr-1 text-xs font-semibold uppercase tracking-wide text-niki-ink/40">
        Showing
      </span>

      {PRESETS.map((p) => (
        <ActionLink
          key={p.key}
          href={href(p.key)}
          aria-current={active === p.key ? "page" : undefined}
          className={cn(pill, active === p.key ? on : off)}
        >
          {p.label}
        </ActionLink>
      ))}

      <div ref={wrap} className="relative">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          aria-haspopup="true"
          className={cn(pill, "flex items-center gap-1.5", active === "custom" ? on : off)}
        >
          <CalendarRange className="h-3.5 w-3.5" />
          {active === "custom" ? label : "Pick dates"}
        </button>

        {open ? (
          <form
            onSubmit={apply}
            className="animate-fade-up absolute left-0 top-[calc(100%+0.5rem)] z-30 w-[min(20rem,calc(100vw-2rem))] rounded-2xl bg-white p-4 shadow-lg ring-1 ring-niki-edge"
          >
            <p className="font-display text-sm font-bold text-niki-ink">Choose a range</p>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <label className="block">
                <span className="mb-1.5 block text-xs font-medium text-niki-ink/70">From</span>
                <input
                  type="date"
                  required
                  value={start}
                  max={end || undefined}
                  onChange={(e) => setStart(e.target.value)}
                  className={cn(inputClass, "px-3 py-2 text-xs")}
                />
              </label>
              <label className="block">
                <span className="mb-1.5 block text-xs font-medium text-niki-ink/70">To</span>
                <input
                  type="date"
                  required
                  value={end}
                  min={start || undefined}
                  onChange={(e) => setEnd(e.target.value)}
                  className={cn(inputClass, "px-3 py-2 text-xs")}
                />
              </label>
            </div>
            <div className="mt-3 flex gap-2">
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="niki-press niki-focus flex-1 rounded-xl bg-niki-surface px-3 py-2 text-xs font-bold text-niki-ink/70 hover:bg-niki-black/5"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="niki-press niki-focus flex-1 rounded-xl bg-niki-black px-3 py-2 text-xs font-bold text-white"
              >
                Show this range
              </button>
            </div>
          </form>
        ) : null}
      </div>
    </div>
  );
}
