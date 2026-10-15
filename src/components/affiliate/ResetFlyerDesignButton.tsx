"use client";

import { useTransition } from "react";
import { Loader2, RotateCcw } from "lucide-react";
import { clearFlyerDesign } from "@/lib/affiliate-console-actions";

/**
 * Give up a design of your own and go back to the house style.
 *
 * Separate from the designer's "back to the house design" button, which only
 * loads those values into the editor: this one clears the stored design, so
 * the flyer follows Nickimart's again from then on — including future changes
 * to it, which a saved copy of today's house style would not.
 */
export function ResetFlyerDesignButton() {
  const [pending, startTransition] = useTransition();

  return (
    <button
      type="button"
      disabled={pending}
      onClick={() =>
        startTransition(async () => {
          await clearFlyerDesign(new FormData());
        })
      }
      className="niki-press niki-focus inline-flex items-center gap-1.5 rounded-lg px-4 py-2 text-sm font-semibold text-niki-ink/70 ring-1 ring-niki-edge-strong hover:bg-white disabled:opacity-60"
    >
      {pending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RotateCcw className="h-3.5 w-3.5" />}
      Use the house design
    </button>
  );
}
