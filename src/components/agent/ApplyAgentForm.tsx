"use client";

import { useActionState, useEffect, useState } from "react";
import { Check, Loader2, Send, X } from "lucide-react";
import { Field, inputClass } from "@/components/ui/Field";
import { SubmitButton } from "@/components/ui/motion";
import { normaliseSlugClient } from "@/lib/data-bundles/slug";
import {
  applyToBeAgent,
  checkStoreName,
  type ApplyState,
  type SlugCheck,
} from "@/lib/data-bundles/agent-application-actions";
import { cn } from "@/lib/cn";

/**
 * Applying to become an agent.
 *
 * Four things: who you are, how to reach you, and the store name you want. No
 * password — the account doesn't exist until an admin approves the application,
 * and approval sends a one-time link for choosing one.
 *
 * The store name is checked as it's typed, because it is the one field that can
 * be refused for a reason the applicant can do something about, and finding
 * that out after submitting is a wasted round trip.
 */
export function ApplyAgentForm({ origin }: { origin: string }) {
  const [state, formAction] = useActionState<ApplyState, FormData>(applyToBeAgent, {});
  const [storeName, setStoreName] = useState("");
  // The last verdict, tagged with the text it was for — see below.
  const [checked, setChecked] = useState<{ for: string; result: SlugCheck }>({
    for: "",
    result: { state: "idle" },
  });

  const preview = normaliseSlugClient(storeName);

  // Debounced availability check. 450ms is long enough that typing a name
  // doesn't fire a query per keystroke, short enough to feel immediate.
  //
  // `cancelled` matters as much as the timer: the request for "nick" can land
  // after the request for "nickland", and without this the field would show a
  // verdict for a name the applicant has already finished typing past.
  useEffect(() => {
    if (!storeName.trim()) return;
    let cancelled = false;
    const t = setTimeout(async () => {
      const result = await checkStoreName(storeName);
      if (cancelled) return;
      setChecked({ for: storeName, result });
    }, 450);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [storeName]);

  // The verdict only counts while it still describes what's in the field, so
  // an edit invalidates it without any state having to be reset.
  const slug: SlugCheck = checked.for === storeName ? checked.result : { state: "idle" };
  const checking = Boolean(storeName.trim()) && checked.for !== storeName;

  if (state.ok) {
    return (
      <div className="animate-scale-in rounded-2xl bg-niki-success/10 p-6 text-center ring-1 ring-niki-success/30">
        <Check className="mx-auto h-8 w-8 text-niki-success" />
        <p className="mt-2 font-display font-bold text-niki-ink">Application received</p>
        <p className="mt-1 text-sm text-niki-ink/70">{state.message}</p>
        <p className="mt-3 text-xs text-niki-ink/50">
          When it&apos;s approved you&apos;ll get a link to set your password and open your store.
        </p>
      </div>
    );
  }

  return (
    <form action={formAction} className="space-y-4" noValidate>
      {state.error ? (
        <p
          role="alert"
          className="animate-fade-up rounded-xl bg-niki-danger/10 px-4 py-3 text-sm font-medium text-niki-danger"
        >
          {state.error}
        </p>
      ) : null}

      <Field label="Full name" htmlFor="fullName">
        <input
          id="fullName"
          name="fullName"
          required
          autoComplete="name"
          placeholder="Nicholas Gyamfi"
          className={inputClass}
        />
      </Field>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field
          label="Phone number"
          htmlFor="phone"
          hint="10 digits starting with 0 — we'll text you the decision."
        >
          <input
            id="phone"
            name="phone"
            required
            inputMode="tel"
            autoComplete="tel"
            maxLength={15}
            placeholder="0241234567"
            className={inputClass}
          />
        </Field>

        <Field label="Email" htmlFor="email">
          <input
            id="email"
            name="email"
            type="email"
            required
            autoComplete="email"
            placeholder="you@example.com"
            className={inputClass}
          />
        </Field>
      </div>

      {/* Store name, with live availability. */}
      <div>
        <label htmlFor="storeName" className="mb-1.5 block text-sm font-medium text-niki-ink">
          Preferred store name <span className="text-niki-danger">*</span>
        </label>
        <div className="relative">
          <input
            id="storeName"
            name="storeName"
            required
            value={storeName}
            onChange={(e) => setStoreName(e.target.value)}
            placeholder="e.g. Nickland Data"
            aria-invalid={slug.state === "taken" || slug.state === "invalid" ? true : undefined}
            aria-describedby="storeName-status"
            className={cn(
              inputClass,
              "pr-10",
              slug.state === "free" && "border-niki-success focus:border-niki-success",
              (slug.state === "taken" || slug.state === "invalid") &&
                "border-niki-danger focus:border-niki-danger",
            )}
          />
          <span className="absolute right-3 top-1/2 -translate-y-1/2">
            {checking ? (
              <Loader2 className="h-4 w-4 animate-spin text-niki-ink/30" aria-hidden />
            ) : slug.state === "free" ? (
              <Check className="animate-scale-in h-4 w-4 text-niki-success" aria-hidden />
            ) : slug.state === "taken" || slug.state === "invalid" ? (
              <X className="animate-scale-in h-4 w-4 text-niki-danger" aria-hidden />
            ) : null}
          </span>
        </div>

        {/* One line, three states — announced so a screen reader hears the
            verdict rather than just watching an icon change. */}
        <p id="storeName-status" aria-live="polite" className="mt-1 text-xs">
          {checking ? (
            <span className="text-niki-ink/50">Checking…</span>
          ) : slug.state === "free" ? (
            <span className="font-medium text-niki-success">
              Available — your store will be {origin}/store/{slug.slug}
            </span>
          ) : slug.state === "taken" || slug.state === "invalid" ? (
            <span className="font-medium text-niki-danger">{slug.message}</span>
          ) : (
            <span className="text-niki-ink/50">
              {preview
                ? `Your store link will be ${origin}/store/${preview}`
                : "This becomes your public store link. Letters, numbers and hyphens only."}
            </span>
          )}
        </p>
      </div>

      <Field
        label="Anything else?"
        htmlFor="note"
        hint="Optional — where you sell, how many customers you have."
      >
        <textarea id="note" name="note" rows={3} className={`${inputClass} resize-y`} />
      </Field>

      <SubmitButton
        pendingLabel="Sending…"
        icon={<Send className="h-4 w-4" />}
        disabled={slug.state === "taken" || slug.state === "invalid"}
        className="w-full rounded-xl bg-niki-orange px-4 py-3.5 text-sm font-bold text-white hover:bg-niki-orange-light"
      >
        Apply to become an agent
      </SubmitButton>

      <p className="text-center text-[11px] leading-relaxed text-niki-ink/45">
        Nothing to pay now. We review every application and text you the decision — usually the same
        day.
      </p>
    </form>
  );
}
