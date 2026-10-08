"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, Clock, Loader2, RefreshCw, ShieldAlert } from "lucide-react";
import { claimOrderPayment, recheckOrderPayment } from "@/lib/data-bundles/claim-actions";
import { formatPrice } from "@/lib/format";

/**
 * What somebody can do about an order that says it was never paid for.
 *
 * This is the screen a person reaches after a MoMo prompt they answered, and
 * the worst thing it could do is tell them nothing was charged — which is what
 * it used to do, and what sends them off to pay a second time. So it offers
 * the two honest moves instead: ask the gateway again, which settles it
 * outright when the money really is there, and say it left the wallet, which
 * puts a claim in front of a person.
 *
 * The order of the two matters. The re-check is free, instant and resolves
 * nearly all of these, so it leads; the claim is underneath for the ones it
 * cannot.
 */

export function PaymentClaimPanel({
  reference,
  amount,
  claimPending,
}: {
  reference: string;
  amount: number;
  claimPending?: boolean;
}) {
  const router = useRouter();
  const [checking, startCheck] = useTransition();
  const [sending, startSend] = useTransition();
  const [notice, setNotice] = useState<{ tone: "ok" | "bad"; text: string } | null>(null);
  const [form, setForm] = useState(false);
  const [claimed, setClaimed] = useState(Boolean(claimPending));
  const [contact, setContact] = useState("");
  const [note, setNote] = useState("");

  function recheck() {
    setNotice(null);
    startCheck(async () => {
      const result = await recheckOrderPayment(reference);
      setNotice(
        result.ok ? { tone: "ok", text: result.message } : { tone: "bad", text: result.error },
      );
      if (result.ok) router.refresh();
    });
  }

  function send() {
    setNotice(null);
    startSend(async () => {
      const result = await claimOrderPayment({ reference, contact, note });
      if (!result.ok) {
        setNotice({ tone: "bad", text: result.error });
        return;
      }
      setNotice({ tone: "ok", text: result.message });
      setClaimed(true);
      setForm(false);
      router.refresh();
    });
  }

  if (claimed) {
    return (
      <div className="border-t border-niki-edge bg-amber-50/60 px-5 py-4">
        <p className="flex items-start gap-2 text-sm font-medium text-amber-800">
          <Clock className="mt-0.5 h-4 w-4 shrink-0" />
          <span>
            Your claim is with us. We&apos;re checking it against the payment gateway and will text
            you as soon as it&apos;s confirmed — your bundle goes out the moment it is.
          </span>
        </p>
        {notice?.tone === "ok" ? (
          <p className="mt-2 text-xs text-amber-700">{notice.text}</p>
        ) : null}
      </div>
    );
  }

  return (
    <div className="border-t border-niki-edge bg-niki-surface/60 px-5 py-4">
      {notice ? (
        <p
          className={
            notice.tone === "ok"
              ? "animate-fade-up mb-3 flex items-start gap-2 rounded-xl bg-niki-success/10 px-4 py-3 text-sm font-medium text-niki-success"
              : "animate-fade-up mb-3 flex items-start gap-2 rounded-xl bg-niki-danger/10 px-4 py-3 text-sm font-medium text-niki-danger"
          }
        >
          {notice.tone === "ok" ? (
            <Check className="mt-0.5 h-4 w-4 shrink-0" />
          ) : (
            <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" />
          )}
          <span>{notice.text}</span>
        </p>
      ) : null}

      {form ? (
        <div className="animate-fade-up space-y-3">
          <p className="text-sm font-semibold text-niki-ink">
            Tell us where {formatPrice(amount)} went
          </p>
          <div>
            <label htmlFor="claim-contact" className="text-xs font-medium text-niki-ink/55">
              The number you paid with
            </label>
            <input
              id="claim-contact"
              value={contact}
              onChange={(e) => setContact(e.target.value)}
              inputMode="tel"
              autoComplete="tel"
              placeholder="0241234567"
              className="mt-1 w-full rounded-xl border border-niki-edge bg-white px-4 py-2.5 text-sm text-niki-ink outline-none focus:border-niki-orange"
            />
          </div>
          <div>
            <label htmlFor="claim-note" className="text-xs font-medium text-niki-ink/55">
              Anything that helps us trace it (optional)
            </label>
            <input
              id="claim-note"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="MoMo transaction ID, or the time it was debited"
              className="mt-1 w-full rounded-xl border border-niki-edge bg-white px-4 py-2.5 text-sm text-niki-ink outline-none focus:border-niki-orange"
            />
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={send}
              disabled={sending}
              className="niki-press niki-focus inline-flex items-center gap-2 rounded-full bg-niki-orange px-5 py-2.5 text-sm font-bold text-white disabled:opacity-60"
            >
              {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              {sending ? "Sending…" : "Submit claim"}
            </button>
            <button
              type="button"
              onClick={() => setForm(false)}
              disabled={sending}
              className="niki-press niki-focus rounded-full px-4 py-2.5 text-sm font-semibold text-niki-ink/60 hover:text-niki-ink"
            >
              Back
            </button>
          </div>
        </div>
      ) : (
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={recheck}
            disabled={checking}
            className="niki-press niki-focus inline-flex items-center gap-2 rounded-full bg-niki-black px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-60"
          >
            {checking ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <RefreshCw className="h-4 w-4" />
            )}
            {checking ? "Checking…" : "I've paid — check again"}
          </button>
          <button
            type="button"
            onClick={() => setForm(true)}
            className="niki-press niki-focus rounded-full px-4 py-2.5 text-sm font-semibold text-niki-ink/65 ring-1 ring-niki-edge hover:bg-niki-black/5"
          >
            It left my wallet
          </button>
        </div>
      )}
    </div>
  );
}
