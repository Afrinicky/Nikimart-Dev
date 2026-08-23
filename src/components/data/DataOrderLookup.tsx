"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Search } from "lucide-react";
import { inputClass } from "@/components/ui/Field";
import { BusyButton } from "@/components/ui/motion";

/**
 * Reference-or-phone search box for the bundle order tracker. `basePath` points
 * it at whichever tracker it's embedded in — NikiMart's own, or an agent's.
 */
export function DataOrderLookup({
  defaultValue = "",
  basePath = "/data-bundles/orders",
}: {
  defaultValue?: string;
  basePath?: string;
}) {
  const router = useRouter();
  const [value, setValue] = useState(defaultValue);
  const [pending, setPending] = useState(false);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = value.trim();
    setPending(true);
    router.push(trimmed ? `${basePath}?q=${encodeURIComponent(trimmed)}` : basePath);
    // The result arrives as a fresh server render, so clear the spinner once
    // React has had the chance to swap the page in.
    setTimeout(() => setPending(false), 1200);
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
      <BusyButton
        type="submit"
        busy={pending}
        pendingLabel="Searching…"
        icon={<Search className="h-4 w-4" />}
        className="shrink-0 rounded-xl bg-niki-orange px-6 py-2.5 text-sm font-semibold text-white hover:bg-niki-orange-light"
      >
        Find order
      </BusyButton>
    </form>
  );
}
