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
    if (trimmed) router.push(`/order-tracking/${encodeURIComponent(trimmed)}`);
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-3 sm:flex-row">
      <input
        type="text"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder="Enter your order number, e.g. NM-10001"
        className={inputClass}
        aria-label="Order number"
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
