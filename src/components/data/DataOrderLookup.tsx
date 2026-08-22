"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Search } from "lucide-react";
import { inputClass } from "@/components/ui/Field";

/** Reference-or-phone search box for the bundle order tracker. */
export function DataOrderLookup({ defaultValue = "" }: { defaultValue?: string }) {
  const router = useRouter();
  const [value, setValue] = useState(defaultValue);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = value.trim();
    router.push(trimmed ? `/data-bundles/orders?q=${encodeURIComponent(trimmed)}` : "/data-bundles/orders");
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-3 sm:flex-row">
      <input
        type="text"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder="Reference (ND-…) or the phone number you used"
        className={inputClass}
        aria-label="Order reference or phone number"
      />
      <button
        type="submit"
        className="flex shrink-0 items-center justify-center gap-2 rounded-xl bg-niki-orange px-6 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-niki-orange-light"
      >
        <Search className="h-4 w-4" />
        Find order
      </button>
    </form>
  );
}
