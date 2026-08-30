"use client";

import { useState } from "react";
import { ArrowDown, ArrowUp, Plus, X } from "lucide-react";
import { inputClass } from "@/components/ui/Field";
import { serialiseHowItWorksSteps, type HowItWorksStep } from "@/lib/how-it-works";

/**
 * The step editor for the public "How it works" page.
 *
 * The steps are numbered on the page, so the order is part of the content and
 * has to be editable — hence the move buttons rather than just add/remove.
 * Everything is serialised into one hidden JSON field, which is how the rest
 * of the admin forms already carry list-shaped values (see KeyAttributesField).
 */
export function HowItWorksField({ initial }: { initial: HowItWorksStep[] }) {
  const [rows, setRows] = useState<HowItWorksStep[]>(initial);

  const update = (i: number, field: keyof HowItWorksStep, value: string) =>
    setRows((prev) => prev.map((r, k) => (k === i ? { ...r, [field]: value } : r)));

  const move = (i: number, by: -1 | 1) =>
    setRows((prev) => {
      const to = i + by;
      if (to < 0 || to >= prev.length) return prev;
      const next = [...prev];
      [next[i], next[to]] = [next[to], next[i]];
      return next;
    });

  return (
    <div>
      <label className="mb-1.5 block text-sm font-medium text-niki-ink">Steps</label>
      <p className="mb-3 text-xs text-niki-ink/55">
        Numbered on the page in this order. Remove them all to restore the built-in steps.
      </p>

      <div className="space-y-3">
        {rows.map((row, i) => (
          <div key={i} className="rounded-xl bg-niki-surface p-3 ring-1 ring-niki-edge">
            <div className="flex items-center gap-2">
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-niki-orange text-[11px] font-bold text-white">
                {i + 1}
              </span>
              <input
                value={row.title}
                onChange={(e) => update(i, "title", e.target.value)}
                placeholder="Step title"
                className={`${inputClass} py-2 text-sm`}
              />
              <button
                type="button"
                onClick={() => move(i, -1)}
                disabled={i === 0}
                aria-label={`Move step ${i + 1} up`}
                className="shrink-0 rounded-lg p-1.5 text-niki-ink/45 transition-colors hover:bg-niki-ink/5 hover:text-niki-ink disabled:opacity-30 disabled:hover:bg-transparent"
              >
                <ArrowUp className="h-4 w-4" />
              </button>
              <button
                type="button"
                onClick={() => move(i, 1)}
                disabled={i === rows.length - 1}
                aria-label={`Move step ${i + 1} down`}
                className="shrink-0 rounded-lg p-1.5 text-niki-ink/45 transition-colors hover:bg-niki-ink/5 hover:text-niki-ink disabled:opacity-30 disabled:hover:bg-transparent"
              >
                <ArrowDown className="h-4 w-4" />
              </button>
              <button
                type="button"
                onClick={() => setRows((prev) => prev.filter((_, k) => k !== i))}
                aria-label={`Remove step ${i + 1}`}
                className="shrink-0 rounded-lg p-1.5 text-niki-ink/45 transition-colors hover:bg-niki-danger/10 hover:text-niki-danger"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <textarea
              value={row.body}
              onChange={(e) => update(i, "body", e.target.value)}
              placeholder="What happens at this step"
              rows={2}
              className={`${inputClass} mt-2 py-2 text-sm`}
            />
          </div>
        ))}
      </div>

      <button
        type="button"
        onClick={() => setRows((prev) => [...prev, { title: "", body: "" }])}
        className="niki-chip mt-3 flex items-center gap-1.5 rounded-full px-3 py-2 text-xs font-semibold text-niki-ink/75 hover:text-niki-ink"
      >
        <Plus className="h-3.5 w-3.5" />
        Add step
      </button>

      <input type="hidden" name="howItWorksSteps" value={serialiseHowItWorksSteps(rows)} />
    </div>
  );
}
