"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Clock, Loader2, RefreshCw } from "lucide-react";
import { checkWalletTopup } from "@/lib/data-bundles/agent-actions";
import { formatMoney } from "@/lib/format";

/**
 * Top-ups that were started and never landed, with a button that asks Paystack
 * about them.
 *
 * An agent who has been debited should never have to wait for somebody to go
 * through a payment dashboard by hand, and should never have to wonder whether
 * we know it happened. Everything behind the button is idempotent, so pressing
 * it twice cannot credit twice.
 */
export function PendingTopups({
  topups,
}: {
  topups: Array<{ reference: string; amount: number; createdAt: string }>;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [note, setNote] = useState<{ ref: string; text: string; ok: boolean } | null>(null);
  const [, startTransition] = useTransition();

  if (topups.length === 0) return null;

  async function check(reference: string) {
    setBusy(reference);
    setNote(null);
    const result = await checkWalletTopup(reference);
    setBusy(null);
    setNote({
      ref: reference,
      text: result.ok ? (result.message ?? "Checked.") : result.error,
      ok: result.ok,
    });
    if (result.ok) startTransition(() => router.refresh());
  }

  return (
    <section className="animate-fade-up rounded-2xl bg-amber-50 p-5 ring-1 ring-amber-200">
      <div className="flex items-center gap-2 text-amber-800">
        <Clock className="h-4 w-4" />
        <h2 className="font-display font-bold">Top-up waiting to clear</h2>
      </div>
      <p className="mt-1 text-sm text-amber-800/80">
        If you were debited, press check — we&apos;ll confirm it with Paystack and credit it
        straight away.
      </p>

      <ul className="mt-3 space-y-2">
        {topups.map((t) => (
          <li
            key={t.reference}
            className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-white px-4 py-3 ring-1 ring-amber-200/60"
          >
            <div className="min-w-0">
              <p className="font-figures text-base font-bold text-niki-ink">
                {formatMoney(t.amount)}
              </p>
              <p className="truncate font-mono text-[11px] text-niki-ink/50">{t.reference}</p>
            </div>
            <div className="flex items-center gap-3">
              {note?.ref === t.reference ? (
                <span
                  className={`text-xs font-medium ${note.ok ? "text-niki-success" : "text-niki-danger"}`}
                >
                  {note.text}
                </span>
              ) : null}
              <button
                type="button"
                onClick={() => check(t.reference)}
                disabled={busy !== null}
                className="niki-press niki-focus inline-flex items-center gap-1.5 rounded-full bg-niki-black px-4 py-2 text-xs font-semibold text-white disabled:opacity-60"
              >
                {busy === t.reference ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <RefreshCw className="h-3.5 w-3.5" />
                )}
                Check payment
              </button>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
