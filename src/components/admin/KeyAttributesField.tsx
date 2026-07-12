"use client";

import { useState } from "react";
import { Plus, X } from "lucide-react";
import { inputClass } from "@/components/ui/Field";
import type { KeyAttribute } from "@/lib/types";

export function KeyAttributesField({ initial = [] }: { initial?: KeyAttribute[] }) {
  const [rows, setRows] = useState<KeyAttribute[]>(initial.length ? initial : []);

  const update = (i: number, field: keyof KeyAttribute, value: string) =>
    setRows((prev) => prev.map((r, k) => (k === i ? { ...r, [field]: value } : r)));

  return (
    <div>
      <label className="mb-1.5 block text-sm font-medium text-niki-ink">Key attributes</label>
      <p className="mb-2 text-xs text-niki-ink/50">
        Shown as a spec table on the product page (e.g. Type, Warranty, Model number…).
      </p>

      <div className="space-y-2">
        {rows.map((row, i) => (
          <div key={i} className="flex items-center gap-2">
            <input
              value={row.label}
              onChange={(e) => update(i, "label", e.target.value)}
              placeholder="Attribute (e.g. Warranty)"
              className={`${inputClass} py-2 text-sm`}
            />
            <input
              value={row.value}
              onChange={(e) => update(i, "value", e.target.value)}
              placeholder="Value (e.g. 1 year)"
              className={`${inputClass} py-2 text-sm`}
            />
            <button
              type="button"
              onClick={() => setRows((prev) => prev.filter((_, k) => k !== i))}
              className="shrink-0 rounded-lg p-2 text-niki-ink/40 transition-colors hover:bg-niki-danger/10 hover:text-niki-danger"
              title="Remove"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        ))}
      </div>

      <button
        type="button"
        onClick={() => setRows((prev) => [...prev, { label: "", value: "" }])}
        className="mt-2 flex items-center gap-1.5 rounded-full bg-niki-surface px-3 py-2 text-xs font-semibold text-niki-ink/70 ring-1 ring-black/5 hover:bg-niki-navy/5"
      >
        <Plus className="h-3.5 w-3.5" />
        Add attribute
      </button>

      <input type="hidden" name="attributes" value={JSON.stringify(rows.filter((r) => r.label.trim() && r.value.trim()))} />
    </div>
  );
}
