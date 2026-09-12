"use client";

import { useActionState, useEffect, useState } from "react";
import { Check, Eye, EyeOff, Loader2, X } from "lucide-react";
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
 * Registering as an agent. One screen, and then either Paystack or the queue.
 *
 * Six fields, because six is what an account needs: who you are, how to reach
 * you, what your store is called, and the password you'll sign in with. The
 * store name is checked as it's typed — it is the one field that can be refused
 * for a reason the applicant can do something about, and finding that out after
 * submitting is a wasted round trip.
 *
 * When the fee is collected up front, submitting hands them straight to
 * Paystack. Whether it is collected up front at all is the admin's setting.
 */
export function ApplyAgentForm({
  origin,
  referralCode = "",
  setupFee,
  referralOpen,
  paymentMode,
  signedInAs,
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
  /** Set when they're already signed in: their account is reused, no password. */
  signedInAs?: { name: string; email: string; phone: string } | null;
}) {
  const [state, formAction] = useActionState<ApplyState, FormData>(applyToBeAgent, {});
  const [storeName, setStoreName] = useState("");
  const [code, setCode] = useState(referralCode);
  const [quote, setQuote] = useState<FeeQuote | null>(null);
  const [showPassword, setShowPassword] = useState(false);
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

  // What the code is worth, quoted as it is typed. A recruiter's waiver is the
  // reason to use their code rather than signing up cold, so it has to be
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
  // With no choice on offer, the form states what will happen rather than
  // asking a question with one answer.
  const choosable = paymentMode === "BOTH" && payable > 0;
  const payingNow = payable > 0 && paymentMode === "UPFRONT";

  if (state.ok) {
    return (
      <div className="animate-scale-in rounded-2xl bg-niki-success/10 p-6 text-center ring-1 ring-niki-success/30">
        <Check className="mx-auto h-8 w-8 text-niki-success" />
        <p className="mt-2 font-display font-bold text-niki-ink">Application received</p>
        <p className="mt-1 text-sm text-niki-ink/70">{state.message}</p>
      </div>
    );
  }

  return (
    <form action={formAction} className="space-y-4" noValidate>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="First name" htmlFor="firstName">
          <input
            id="firstName"
            name="firstName"
            required
            autoComplete="given-name"
            defaultValue={signedInAs?.name.split(" ")[0] ?? ""}
            placeholder="Nicholas"
            className={inputClass}
          />
        </Field>
        <Field label="Last name" htmlFor="lastName">
          <input
            id="lastName"
            name="lastName"
            required
            autoComplete="family-name"
            defaultValue={signedInAs?.name.split(" ").slice(1).join(" ") ?? ""}
            placeholder="Gyamfi"
            className={inputClass}
          />
        </Field>
      </div>

      <Field label="Phone number" htmlFor="phone">
        <input
          id="phone"
          name="phone"
          required
          inputMode="tel"
          autoComplete="tel"
          maxLength={15}
          defaultValue={signedInAs?.phone ?? ""}
          placeholder="0241234567"
          className={inputClass}
        />
      </Field>

      {signedInAs ? (
        <div>
          <span className="mb-1.5 block text-sm font-medium text-niki-ink">Email</span>
          <p className="rounded-xl border border-niki-edge-strong bg-niki-surface px-4 py-2.5 text-sm text-niki-ink/70">
            {signedInAs.email}
          </p>
          <span className="mt-1 block text-xs text-niki-ink/50">
            Your store is added to this account — sign in with the password you already use.
          </span>
        </div>
      ) : (
        <>
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

          <div>
            <label htmlFor="password" className="mb-1.5 block text-sm font-medium text-niki-ink">
              Password
            </label>
            <div className="relative">
              <input
                id="password"
                name="password"
                type={showPassword ? "text" : "password"}
                required
                minLength={6}
                autoComplete="new-password"
                placeholder="At least 6 characters"
                className={`${inputClass} pr-11`}
              />
              <button
                type="button"
                onClick={() => setShowPassword((v) => !v)}
                aria-label={showPassword ? "Hide password" : "Show password"}
                className="niki-focus absolute right-2 top-1/2 -translate-y-1/2 rounded-lg p-1.5 text-niki-ink/40 hover:text-niki-ink/70"
              >
                {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
          </div>
        </>
      )}

      {/* Store name, with live availability. */}
      <div>
        <label htmlFor="storeName" className="mb-1.5 block text-sm font-medium text-niki-ink">
          Store name
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
              Available — {origin}/store/{slug.slug}
            </span>
          ) : slug.state === "taken" || slug.state === "invalid" ? (
            <span className="font-medium text-niki-danger">{slug.message}</span>
          ) : (
            <span className="text-niki-ink/50">
              {preview ? `${origin}/store/${preview}` : "This becomes your public store link."}
            </span>
          )}
        </p>
      </div>

      {referralOpen ? (
        <Field label="Referral code" htmlFor="referralCode" hint="Optional.">
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
              {quote.referrerName ? `, thanks to ${quote.referrerName}` : ""}
            </p>
          ) : null}

          {payable <= 0 ? (
            <>
              <input type="hidden" name="feeMethod" value="BALANCE" />
              <p className="mt-2 text-xs font-medium text-niki-success">Nothing to pay.</p>
            </>
          ) : choosable ? (
            <div className="mt-3">
              <Field label="How would you like to settle it?" htmlFor="feeMethod">
                <select id="feeMethod" name="feeMethod" defaultValue="BALANCE" className={inputClass}>
                  <option value="BALANCE">Take it from my commission</option>
                  <option value="UPFRONT">Pay {money(payable)} now</option>
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
                {payingNow
                  ? "Payable now, on the next screen."
                  : "Taken from the commission you earn — nothing to pay now."}
              </p>
            </>
          )}
        </div>
      ) : null}

      <AcceptTerms audience="agent" error={state.termsError} />

      <FormFeedback error={state.error} />
      <SubmitButton
        pendingLabel={payingNow ? "Taking you to payment…" : "Sending…"}
        disabled={slug.state === "taken" || slug.state === "invalid"}
        className="w-full rounded-xl bg-niki-orange px-4 py-3.5 text-sm font-bold text-white hover:bg-niki-orange-light"
      >
        {payingNow ? "Continue to payment" : "Create my agent account"}
      </SubmitButton>

      <p className="text-center text-[11px] leading-relaxed text-niki-ink/45">
        {payingNow
          ? "Closed Paystack or the payment failed? Submit this form again with the same email."
          : "We review every application and text you the decision."}
      </p>
    </form>
  );
}
