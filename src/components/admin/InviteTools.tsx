"use client";

import { useActionState, useEffect, useState } from "react";
import { Check, Copy, Share2, Ticket } from "lucide-react";
import { Field, inputClass } from "@/components/ui/Field";
import { SubmitButton } from "@/components/ui/motion";
import { issueInvite, type InviteState } from "@/lib/data-bundles/invite-actions";
import { cn } from "@/lib/cn";

/**
 * Issuing a registration link, and copying one out.
 *
 * The discount is the only real setting, and the form says what each end of it
 * means — 0% is the normal fee, 100% is a free account — because "waiver
 * percent" on its own is a number somebody can get backwards.
 */

const QUICK = [0, 25, 50, 100];

export function IssueInviteForm() {
  const [state, formAction] = useActionState<InviteState, FormData>(issueInvite, {});
  const [waiver, setWaiver] = useState("100");

  return (
    <form action={formAction} className="space-y-4 rounded-2xl bg-white p-5 ring-1 ring-niki-edge">
      <div className="flex items-center gap-2">
        <Ticket className="h-4 w-4 text-niki-orange" />
        <h2 className="font-display font-bold text-niki-ink">Issue a registration link</h2>
      </div>

      {state.error ? (
        <p className="animate-fade-up rounded-xl bg-niki-danger/10 px-4 py-3 text-sm font-medium text-niki-danger">
          {state.error}
        </p>
      ) : null}
      {state.ok ? (
        <p className="animate-fade-up rounded-xl bg-niki-success/10 px-4 py-3 text-sm font-medium text-niki-success">
          {state.message}
        </p>
      ) : null}

      <Field label="What is it for?" htmlFor="label" hint="Only you see this.">
        <input
          id="label"
          name="label"
          required
          maxLength={80}
          placeholder="Accra campus drive"
          className={inputClass}
        />
      </Field>

      <div>
        <span className="mb-1.5 block text-sm font-medium text-niki-ink">Discount</span>
        <div className="mb-2 flex flex-wrap gap-2">
          {QUICK.map((n) => (
            <button
              key={n}
              type="button"
              onClick={() => setWaiver(String(n))}
              className={cn(
                "niki-press niki-focus rounded-lg px-3 py-1.5 text-xs font-semibold ring-1 transition-colors",
                Number(waiver) === n
                  ? "bg-niki-orange text-white ring-niki-orange"
                  : "bg-white text-niki-ink/65 ring-niki-edge hover:bg-niki-black/5",
              )}
            >
              {n === 0 ? "Full price" : n === 100 ? "Free" : `${n}% off`}
            </button>
          ))}
        </div>
        <input
          id="waiverPercent"
          name="waiverPercent"
          type="number"
          min={0}
          max={100}
          step="1"
          required
          value={waiver}
          onChange={(e) => setWaiver(e.target.value)}
          className={inputClass}
        />
        <span className="mt-1 block text-xs text-niki-ink/50">
          Percent off the registration fee. 100% waives it entirely.
        </span>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Uses" htmlFor="maxUses" hint="Blank for unlimited.">
          <input
            id="maxUses"
            name="maxUses"
            type="number"
            min={0}
            step="1"
            placeholder="Unlimited"
            className={inputClass}
          />
        </Field>
        <Field label="Expires" htmlFor="expiresAt" hint="Blank for never.">
          <input id="expiresAt" name="expiresAt" type="date" className={inputClass} />
        </Field>
      </div>

      <SubmitButton
        pendingLabel="Creating…"
        className="w-full rounded-xl bg-niki-black px-4 py-2.5 text-sm font-semibold text-white hover:bg-niki-black-mute"
      >
        Create link
      </SubmitButton>
    </form>
  );
}

/** Copy the link, or hand it to the device's share sheet on a phone. */
export function InviteLink({ url }: { url: string }) {
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!copied) return;
    const t = setTimeout(() => setCopied(false), 1800);
    return () => clearTimeout(t);
  }, [copied]);

  async function copy() {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
    } catch {
      // Clipboard blocked — the URL is on screen to select by hand.
    }
  }

  async function share() {
    if (typeof navigator !== "undefined" && navigator.share) {
      try {
        await navigator.share({ url, title: "Nickimart agent registration" });
        return;
      } catch {
        // Cancelled, or unsupported — fall through to copying.
      }
    }
    await copy();
  }

  const btn =
    "niki-press niki-focus inline-flex h-8 w-8 items-center justify-center rounded-lg text-niki-ink/55 ring-1 ring-niki-edge hover:bg-niki-black/5";

  return (
    <div className="flex items-center gap-1.5">
      <button type="button" onClick={copy} title="Copy link" aria-label="Copy link" className={btn}>
        {copied ? <Check className="h-4 w-4 text-niki-success" /> : <Copy className="h-4 w-4" />}
      </button>
      <button
        type="button"
        onClick={share}
        title="Share link"
        aria-label="Share link"
        className={btn}
      >
        <Share2 className="h-4 w-4" />
      </button>
    </div>
  );
}
