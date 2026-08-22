"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/cn";
import { setStoreOpen } from "@/lib/data-bundles/agent-actions";

/** Open or close the storefront. The banner it sits in changes colour with it. */
export function StoreOpenToggle({ open }: { open: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function toggle() {
    setBusy(true);
    await setStoreOpen(!open);
    setBusy(false);
    router.refresh();
  }

  return (
    <div
      className={cn(
        "flex flex-wrap items-center justify-between gap-3 rounded-2xl px-5 py-4 ring-1",
        open
          ? "bg-niki-success/10 ring-niki-success/30"
          : "bg-niki-danger/10 ring-niki-danger/30",
      )}
    >
      <p className="text-sm text-niki-ink/75">
        Your store is{" "}
        <span className={cn("font-bold", open ? "text-niki-success" : "text-niki-danger")}>
          {open ? "open" : "closed"}
        </span>{" "}
        {open ? "and visible to customers." : "— customers can't buy from it right now."}
      </p>
      <button
        type="button"
        onClick={toggle}
        disabled={busy}
        role="switch"
        aria-checked={open}
        aria-label={open ? "Close store" : "Open store"}
        className={cn(
          "niki-focus relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors disabled:opacity-50",
          open ? "bg-niki-success" : "bg-niki-ink/25",
        )}
      >
        <span
          className={cn(
            "inline-block h-4.5 w-4.5 transform rounded-full bg-white shadow transition-transform",
            open ? "translate-x-6" : "translate-x-1",
          )}
        />
      </button>
    </div>
  );
}
