"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Search } from "lucide-react";
import { inputClass } from "@/components/ui/Field";

export function OrderLookup({ defaultValue = "" }: { defaultValue?: string }) {
  const router = useRouter();
  const [value, setValue] = useState(defaultValue);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = value.trim();
    // One front door: /order-tracking works out whether this is a marketplace
    // order number, a data reference, or the phone a bundle was paid with.
    if (trimmed) router.push(`/order-tracking?q=${encodeURIComponent(trimmed)}`);
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-3 sm:flex-row">
      <input
        type="text"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder="Order number, ND- reference, or your phone number"
        className={inputClass}
        aria-label="Order number, reference, or phone number"
      />
      <button
        type="submit"
        className="flex shrink-0 items-center justify-center gap-2 rounded-xl bg-niki-orange px-6 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-niki-orange-light"
      >
        <Search className="h-4 w-4" />
        Track order
      </button>
    </form>
  );
}
