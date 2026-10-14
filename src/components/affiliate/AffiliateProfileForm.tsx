"use client";

import { useActionState, useState } from "react";
import { Loader2 } from "lucide-react";
import {
  saveAffiliateProfile,
  setAffiliateCode,
  type ActionState,
} from "@/lib/affiliate-console-actions";
import { PRODUCT_FLYER_THEMES } from "@/lib/affiliate-flyer";
import { inputClass } from "@/components/ui/Field";
import { cn } from "@/lib/cn";

/**
 * The affiliate's own settings: how they are paid, what their flyers say, and
 * what colour they come out.
 *
 * The default caption is here rather than only on each product because most
 * affiliates write one line and use it everywhere; per-product captions exist
 * for the ones they care enough to tailor. Payout details are asked for once,
 * not on every request, and are snapshotted onto a payout when it is made so
 * that editing them later cannot rewrite a payment already sent.
 */
export function AffiliateProfileForm({
  affiliate,
  defaultShareMessage,
}: {
  affiliate: {
    name: string;
    phone: string;
    shareMessage: string;
    flyerTheme: string;
    payoutMethod: string;
    payoutName: string;
    payoutNumber: string;
    payoutNetwork: string;
  };
  /** The programme default, shown as the placeholder. */
  defaultShareMessage: string;
}) {
  const [state, action, pending] = useActionState<ActionState, FormData>(saveAffiliateProfile, {});
  const [theme, setTheme] = useState(affiliate.flyerTheme || PRODUCT_FLYER_THEMES[0].key);
  const [method, setMethod] = useState(affiliate.payoutMethod || "momo");

  return (
    <form action={action} className="space-y-5">
      <input type="hidden" name="flyerTheme" value={theme} />

      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block">
          <span className="mb-1.5 block text-sm font-medium text-niki-ink/80">Your name</span>
          <input name="name" defaultValue={affiliate.name} maxLength={120} className={inputClass} />
          <span className="mt-1 block text-xs text-niki-ink/45">
            Printed on your flyers as &ldquo;shared by&rdquo;.
          </span>
        </label>
        <label className="block">
          <span className="mb-1.5 block text-sm font-medium text-niki-ink/80">Phone number</span>
          <input
            name="phone"
            type="tel"
            defaultValue={affiliate.phone}
            maxLength={32}
            className={inputClass}
          />
        </label>
      </div>

      <label className="block">
        <span className="mb-1.5 block text-sm font-medium text-niki-ink/80">
          Default message on your shares
        </span>
        <textarea
          name="shareMessage"
          defaultValue={affiliate.shareMessage}
          rows={3}
          maxLength={600}
          placeholder={defaultShareMessage}
          className={inputClass}
        />
        <span className="mt-1 block text-xs leading-relaxed text-niki-ink/45">
          Used for any product you haven&apos;t written one for. Use{" "}
          <code className="font-mono">{"{product}"}</code>,{" "}
          <code className="font-mono">{"{price}"}</code>,{" "}
          <code className="font-mono">{"{shop}"}</code> or{" "}
          <code className="font-mono">{"{link}"}</code> and they&apos;ll be filled in.
        </span>
      </label>

      <fieldset>
        <legend className="mb-2 block text-sm font-medium text-niki-ink/80">
          Default flyer colour
        </legend>
        <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">
          {PRODUCT_FLYER_THEMES.map((t) => (
            <button
              key={t.key}
              type="button"
              onClick={() => setTheme(t.key)}
              aria-pressed={t.key === theme}
              className={cn(
                "niki-press niki-focus rounded-xl px-2 py-2.5 text-xs font-semibold ring-1 transition-colors",
                t.key === theme
                  ? "bg-niki-orange/10 text-niki-orange ring-niki-orange"
                  : "bg-white text-niki-ink/60 ring-niki-edge hover:bg-niki-black/5",
              )}
            >
              <span
                aria-hidden
                className="mx-auto mb-1.5 block h-6 w-full rounded-md ring-1 ring-niki-black/10"
                style={{ background: `linear-gradient(135deg, ${t.backdropFrom}, ${t.accent})` }}
              />
              {t.label}
            </button>
          ))}
        </div>
      </fieldset>

      <fieldset className="rounded-2xl bg-niki-surface p-4">
        <legend className="px-1 text-sm font-medium text-niki-ink/80">Where to pay you</legend>
        <div className="mt-2 grid gap-3 sm:grid-cols-2">
          <label className="block">
            <span className="mb-1.5 block text-sm font-medium text-niki-ink/80">Method</span>
            <select
              name="payoutMethod"
              value={method}
              onChange={(e) => setMethod(e.target.value)}
              className={inputClass}
            >
              <option value="momo">Mobile Money</option>
              <option value="bank">Bank transfer</option>
            </select>
          </label>
          <label className="block">
            <span className="mb-1.5 block text-sm font-medium text-niki-ink/80">
              {method === "bank" ? "Bank" : "Network"}
            </span>
            <input
              name="payoutNetwork"
              defaultValue={affiliate.payoutNetwork}
              maxLength={64}
              placeholder={method === "bank" ? "e.g. GCB Bank" : "e.g. MTN MoMo"}
              className={inputClass}
            />
          </label>
          <label className="block">
            <span className="mb-1.5 block text-sm font-medium text-niki-ink/80">
              {method === "bank" ? "Account number" : "MoMo number"}
            </span>
            <input
              name="payoutNumber"
              defaultValue={affiliate.payoutNumber}
              maxLength={64}
              className={cn(inputClass, "font-mono")}
            />
          </label>
          <label className="block">
            <span className="mb-1.5 block text-sm font-medium text-niki-ink/80">Account name</span>
            <input
              name="payoutName"
              defaultValue={affiliate.payoutName}
              maxLength={120}
              className={inputClass}
            />
          </label>
        </div>
        <p className="mt-2 text-xs text-niki-ink/45">
          Snapshotted onto each payout when you request it, so changing these later never rewrites a
          payment already sent.
        </p>
      </fieldset>

      {state.error ? (
        <p className="animate-fade-up rounded-xl bg-niki-danger/10 px-4 py-3 text-sm font-medium text-niki-danger ring-1 ring-niki-danger/20">
          {state.error}
        </p>
      ) : null}
      {state.message ? (
        <p className="animate-fade-up rounded-xl bg-niki-success/10 px-4 py-3 text-sm font-medium text-niki-success ring-1 ring-niki-success/20">
          {state.message}
        </p>
      ) : null}

      <button
        type="submit"
        disabled={pending}
        className="niki-press niki-focus inline-flex items-center gap-2 rounded-full bg-niki-orange px-5 py-2.5 text-sm font-bold text-white hover:bg-niki-orange-light disabled:opacity-60"
      >
        {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
        Save changes
      </button>
    </form>
  );
}

/**
 * Choosing a referral code.
 *
 * Offered once, while nothing depends on it. A code is printed on flyers and
 * pasted into bios; changing it after people have followed those links breaks
 * them silently and stops paying the affiliate, so the server refuses once
 * there is a single click or order against it.
 */
export function AffiliateCodeForm({ code, locked }: { code: string; locked: boolean }) {
  const [state, action, pending] = useActionState<ActionState, FormData>(setAffiliateCode, {});

  if (locked) {
    return (
      <div>
        <p className="font-mono text-lg font-bold text-niki-orange">{code}</p>
        <p className="mt-1 text-xs leading-relaxed text-niki-ink/50">
          Your code is on links people have already followed, so it is fixed from here — changing it
          would stop those links paying you.
        </p>
      </div>
    );
  }

  return (
    <form action={action} className="space-y-3">
      <label className="block">
        <span className="mb-1.5 block text-sm font-medium text-niki-ink/80">Referral code</span>
        <input
          name="code"
          defaultValue={code}
          maxLength={12}
          className={cn(inputClass, "font-mono uppercase")}
        />
        <span className="mt-1 block text-xs text-niki-ink/45">
          4–12 letters and numbers. You can change it until the first click lands.
        </span>
      </label>

      {state.error ? (
        <p className="rounded-xl bg-niki-danger/10 px-4 py-3 text-sm font-medium text-niki-danger ring-1 ring-niki-danger/20">
          {state.error}
        </p>
      ) : null}
      {state.message ? (
        <p className="rounded-xl bg-niki-success/10 px-4 py-3 text-sm font-medium text-niki-success ring-1 ring-niki-success/20">
          {state.message}
        </p>
      ) : null}

      <button
        type="submit"
        disabled={pending}
        className="niki-press niki-focus inline-flex items-center gap-2 rounded-full px-5 py-2.5 text-sm font-bold text-niki-ink/70 ring-1 ring-niki-edge-strong hover:bg-white disabled:opacity-60"
      >
        {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
        Update code
      </button>
    </form>
  );
}
