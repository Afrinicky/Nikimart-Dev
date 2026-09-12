"use client";

import { useActionState, useEffect, useState } from "react";
import { Check, Loader2, Send, X } from "lucide-react";
import { Field, inputClass } from "@/components/ui/Field";
import { SubmitButton } from "@/components/ui/motion";
import { AcceptTerms } from "@/components/ui/AcceptTerms";
import { normaliseSlugClient } from "@/lib/data-bundles/slug";
import {
  applyToBeAgent,
  checkStoreName,
  quoteRegistration,
  type ApplyState,
  type FeeQuote,
  type SlugCheck,
} from "@/lib/data-bundles/agent-application-actions";
import { cn } from "@/lib/cn";
import { formatMoney as money } from "@/lib/format";
import { FormFeedback } from "@/components/ui/FormFeedback";

/**
 * Applying to become an agent.
 *
 * Who you are, how to reach you, the store name you want, and — if somebody
 * recruited you — their agent code. No password: the account doesn't exist
 * until an admin approves the application, and approval sends a one-time link
 * for choosing one.
 *
 * The store name is checked as it's typed, because it is the one field that can
 * be refused for a reason the applicant can do something about, and finding
 * that out after submitting is a wasted round trip.
 */
export function ApplyAgentForm({
  origin,
  referralCode = "",
  setupFee,
  referralOpen,
  paymentMode,
}: {
  origin: string;
  /** Prefilled from ?ref= on an invite link, and still editable. */
  referralCode?: string;
  /** What it costs to open a store. 0 means there is no fee to choose about. */
  setupFee: number;
  /** False when the programme is closed — the code field is then pointless. */
  referralOpen: boolean;
  /** How the admin collects the fee: up front, from commission, or either. */
  paymentMode: "UPFRONT" | "COMMISSION" | "BOTH";
}) {
  const [state, formAction] = useActionState<ApplyState, FormData>(applyToBeAgent, {});
  const [storeName, setStoreName] = useState("");
  const [code, setCode] = useState(referralCode);
  const [quote, setQuote] = useState<FeeQuote | null>(null);
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

  // What the code is worth, quoted as it is typed. A recruiter's waiver is
  // the reason to use their code rather than signing up cold, so it has to be
  // visible before the form is submitted, not discovered on approval.
  useEffect(() => {
    if (!referralOpen || setupFee <= 0) return;
    let cancelled = false;
    const t = setTimeout(async () => {
      const result = await quoteRegistration(code);
      if (!cancelled) setQuote(result);
    }, 450);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [code, referralOpen, setupFee]);

  const payable = quote ? quote.payable : setupFee;
  const discounted = Boolean(quote && quote.waiverPercent > 0);

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

      {referralOpen ? (
        <Field
          label="Referral code"
          htmlFor="referralCode"
          hint="Optional — the agent code of whoever told you about Nickimart. It's how they get credited, and it can't be added once your account is trading."
        >
          <input
            id="referralCode"
            name="referralCode"
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase())}
            maxLength={20}
            autoCapitalize="characters"
            placeholder="e.g. NKM4821"
            className={`${inputClass} font-mono uppercase`}
          />
        </Field>
      ) : null}

      {setupFee > 0 ? (
        <div className="rounded-2xl bg-niki-surface p-4">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <p className="text-sm font-semibold text-niki-ink">Registration fee</p>
            <p className="font-figures text-lg font-bold text-niki-ink">
              {discounted ? (
                <>
                  <span className="mr-2 text-sm font-medium text-niki-ink/40 line-through">
                    {money(setupFee)}
                  </span>
                  {payable > 0 ? money(payable) : "Free"}
                </>
              ) : (
                money(setupFee)
              )}
            </p>
          </div>

          {discounted && quote ? (
            <p className="mt-1 text-xs font-medium text-niki-success">
              {quote.waiverPercent}% off
              {quote.referrerName ? `, thanks to ${quote.referrerName}` : ""} — because you were
              referred.
            </p>
          ) : null}

          {/*
            Which of the two the applicant may choose is the admin's call. With
            only one on offer there is nothing to ask, so the form states what
            will happen and posts it as a hidden field rather than showing a
            select with a single option.
          */}
          {payable <= 0 ? (
            <input type="hidden" name="feeMethod" value="BALANCE" />
          ) : paymentMode === "BOTH" ? (
            <div className="mt-3">
              <Field label="How would you like to settle it?" htmlFor="feeMethod">
                <select
                  id="feeMethod"
                  name="feeMethod"
                  defaultValue="BALANCE"
                  className={inputClass}
                >
                  <option value="BALANCE">
                    Take it from my commission — start selling with nothing to pay
                  </option>
                  <option value="UPFRONT">
                    I&apos;ll pay {money(payable)} up front once I&apos;m approved
                  </option>
                </select>
              </Field>
            </div>
          ) : (
            <>
              <input
                type="hidden"
                name="feeMethod"
                value={paymentMode === "UPFRONT" ? "UPFRONT" : "BALANCE"}
              />
              <p className="mt-2 text-xs text-niki-ink/60">
                {paymentMode === "UPFRONT"
                  ? `Payable once you're approved. Your storefront opens for business as soon as the ${money(payable)} clears.`
                  : "Nothing to pay before you start — it comes out of the commission you earn."}
              </p>
            </>
          )}

          {payable <= 0 ? (
            <p className="mt-2 text-xs font-medium text-niki-success">
              Nothing to pay. Your registration is covered in full.
            </p>
          ) : null}
        </div>
      ) : null}

      <Field
        label="Anything else?"
        htmlFor="note"
        hint="Optional — where you sell, how many customers you have."
      >
        <textarea id="note" name="note" rows={3} className={`${inputClass} resize-y`} />
      </Field>

      <AcceptTerms audience="agent" error={state.termsError} />

      <FormFeedback error={state.error} />
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
