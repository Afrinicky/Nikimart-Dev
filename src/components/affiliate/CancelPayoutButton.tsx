"use client";

import { useTransition } from "react";
import { Loader2, X } from "lucide-react";
import { cancelPayoutRequest } from "@/lib/affiliate-console-actions";

/**
 * Withdraw a payout request that has not been decided yet.
 *
 * Worth having because the alternative is a support message: somebody who
 * asked for the wrong amount currently has to wait for an admin to decline it
 * before they can ask again. Withdrawing releases the commission lines it had
 * claimed, so the next request can cover them.
 */
export function CancelPayoutButton({ id }: { id: string }) {
  const [pending, startTransition] = useTransition();

  return (
    <button
      type="button"
      title="Withdraw this request"
      disabled={pending}
      onClick={() =>
        startTransition(async () => {
          const fd = new FormData();
          fd.set("id", id);
          await cancelPayoutRequest(fd);
        })
      }
      className="niki-press niki-focus inline-flex items-center gap-1 rounded-full px-2.5 py-1.5 text-[11px] font-bold text-niki-ink/55 ring-1 ring-niki-edge-strong transition-colors hover:bg-niki-surface disabled:opacity-60"
    >
      {pending ? <Loader2 className="h-3 w-3 animate-spin" /> : <X className="h-3 w-3" />}
      Withdraw
    </button>
  );
}
