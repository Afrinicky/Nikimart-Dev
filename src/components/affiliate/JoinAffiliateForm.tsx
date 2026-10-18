"use client";

import { useActionState } from "react";
import { ArrowRight, Loader2 } from "lucide-react";
import { joinAffiliateProgramme, type ActionState } from "@/lib/affiliate-console-actions";
import { inputClass } from "@/components/ui/Field";
import { cn } from "@/lib/cn";

/**
 * The way in.
 *
 * Two shapes, one form. Somebody who already trades on Nickimart — a seller,
 * a bundle agent — is admitted on the spot, so all they are asked for is the
 * code they would like; asking them about their following before they can
 * share the catalogue they already sell on is friction with no decision behind
 * it. Everybody else answers the three questions an admin actually uses to
 * decide: where they will post, how many people see it, and why.
 */

/** Money, the way this form says it everywhere else. */
function money(amount: number): string {
  return `GH₵${amount.toLocaleString("en-GH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

const CHANNELS = [
  { value: "whatsapp", label: "WhatsApp" },
  { value: "instagram", label: "Instagram" },
  { value: "tiktok", label: "TikTok" },
  { value: "facebook", label: "Facebook" },
  { value: "x", label: "X / Twitter" },
  { value: "telegram", label: "Telegram" },
  { value: "snapchat", label: "Snapchat" },
  { value: "campus", label: "Campus / in person" },
];

export function JoinAffiliateForm({
  route,
  defaultName,
  defaultPhone = "",
  referralCode = "",
  referrerName = "",
  invite = null,
  fee,
  paymentMode = "BOTH",
  via = "",
}: {
  /** "auto" admits them immediately; "apply" files an application. */
  route: "auto" | "apply";
  defaultName: string;
  defaultPhone?: string;
  /** The recruiter's code they arrived on, already resolved server-side. */
  referralCode?: string;
  referrerName?: string;
  /** A registration link Nickimart issued, already resolved. */
  invite?: { code: string; waiverPercent: number } | null;
  /** What they will be charged, quoted on the server. */
  fee: { gross: number; waived: number; waiverPercent: number; payable: number };
  paymentMode?: "UPFRONT" | "COMMISSION" | "BOTH";
  /** The door they came through, when it carries a price of its own. */
  via?: string;
}) {
  const [state, action, pending] = useActionState<ActionState, FormData>(
    joinAffiliateProgramme,
    {},
  );

  const discounted = fee.waiverPercent > 0 && fee.gross > 0;
  const choosable = paymentMode === "BOTH" && fee.payable > 0;
  const payingNow = fee.payable > 0 && paymentMode === "UPFRONT";

  return (
    <form action={action} className="space-y-4">
      {/* The link they arrived on, carried through the submit. Re-resolved and
          re-priced on the server, so editing these buys nothing. */}
      <input type="hidden" name="ref" value={referralCode} />
      <input type="hidden" name="invite" value={invite?.code ?? ""} />
      <input type="hidden" name="via" value={via} />
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block">
          <span className="mb-1.5 block text-sm font-medium text-niki-ink/80">Your name</span>
          <input
            name="fullName"
            defaultValue={defaultName}
            required
            maxLength={120}
            className={inputClass}
          />
        </label>
        <label className="block">
          <span className="mb-1.5 block text-sm font-medium text-niki-ink/80">
            Phone number
            <span className="ml-1 text-xs font-normal text-niki-ink/45">(for your payouts)</span>
          </span>
          <input
            name="phone"
            type="tel"
            defaultValue={defaultPhone}
            required
            maxLength={32}
            placeholder="024 000 0000"
            className={inputClass}
          />
        </label>
      </div>

      <label className="block">
        <span className="mb-1.5 block text-sm font-medium text-niki-ink/80">
          Referral code you&apos;d like
          <span className="ml-1 text-xs font-normal text-niki-ink/45">(optional)</span>
        </span>
        <input
          name="code"
          maxLength={12}
          placeholder="e.g. AMA24"
          className={cn(inputClass, "font-mono uppercase")}
        />
        <span className="mt-1.5 block text-xs text-niki-ink/50">
          4–12 letters and numbers. It goes on every link you share, so pick something people can
          read out. Taken already? We&apos;ll generate one.
        </span>
      </label>

      {route === "apply" ? (
        <>
          <fieldset>
            <legend className="mb-2 block text-sm font-medium text-niki-ink/80">
              Where will you promote?
            </legend>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {CHANNELS.map((channel) => (
                <label
                  key={channel.value}
                  className="flex cursor-pointer items-center gap-2 rounded-xl bg-white px-3 py-2.5 text-sm font-medium text-niki-ink/75 ring-1 ring-niki-edge transition-colors hover:bg-niki-surface has-checked:ring-niki-orange"
                >
                  <input
                    type="checkbox"
                    name="channels"
                    value={channel.value}
                    className="h-4 w-4 accent-niki-orange"
                  />
                  {channel.label}
                </label>
              ))}
            </div>
          </fieldset>

          <label className="block">
            <span className="mb-1.5 block text-sm font-medium text-niki-ink/80">
              How many people do you reach?
            </span>
            <input
              name="audience"
              maxLength={200}
              placeholder="e.g. 4,000 on WhatsApp status, 1,200 on TikTok"
              className={inputClass}
            />
          </label>

          <label className="block">
            <span className="mb-1.5 block text-sm font-medium text-niki-ink/80">
              Anything else we should know?
              <span className="ml-1 text-xs font-normal text-niki-ink/45">(optional)</span>
            </span>
            <textarea
              name="note"
              rows={3}
              maxLength={1000}
              placeholder="What you sell or post about, and which products you'd promote."
              className={inputClass}
            />
          </label>
        </>
      ) : null}

      {fee.gross > 0 ? (
        <div className="rounded-2xl bg-niki-surface p-4">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <p className="text-sm font-semibold text-niki-ink">Registration fee</p>
            <p className="font-figures text-lg font-bold text-niki-ink">
              {discounted ? (
                <>
                  <span className="mr-2 text-sm font-medium text-niki-ink/40 line-through">
                    {money(fee.gross)}
                  </span>
                  {fee.payable > 0 ? money(fee.payable) : "Free"}
                </>
              ) : (
                money(fee.gross)
              )}
            </p>
          </div>

          {discounted ? (
            <p className="mt-1 text-xs font-medium text-niki-success">
              {fee.waiverPercent >= 100 ? "Waived in full" : `${fee.waiverPercent}% off`}
              {invite && invite.waiverPercent >= fee.waiverPercent
                ? " — your Nickimart invitation"
                : referrerName
                  ? `, thanks to ${referrerName}`
                  : ""}
            </p>
          ) : null}

          {fee.payable <= 0 ? (
            <>
              <input type="hidden" name="feeMethod" value="COMMISSION" />
              <p className="mt-2 text-xs font-medium text-niki-success">Nothing to pay.</p>
            </>
          ) : choosable ? (
            <label className="mt-3 block">
              <span className="mb-1.5 block text-sm font-medium text-niki-ink/80">
                How would you like to settle it?
              </span>
              <select name="feeMethod" defaultValue="COMMISSION" className={inputClass}>
                <option value="COMMISSION">Take it from my commission</option>
                <option value="UPFRONT">Pay {money(fee.payable)} now</option>
              </select>
            </label>
          ) : (
            <>
              <input
                type="hidden"
                name="feeMethod"
                value={paymentMode === "UPFRONT" ? "UPFRONT" : "COMMISSION"}
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

      {referrerName ? (
        <p className="rounded-xl bg-white px-4 py-2.5 text-xs text-niki-ink/60 ring-1 ring-niki-edge">
          {referrerName} recruited you. They earn a share of what you earn — it costs you nothing.
        </p>
      ) : null}

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
        className="niki-press niki-focus flex w-full items-center justify-center gap-2 rounded-full bg-niki-orange px-5 py-3 text-sm font-bold text-white transition-colors hover:bg-niki-orange-light disabled:opacity-60"
      >
        {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
        {payingNow
          ? "Continue to payment"
          : route === "auto"
            ? "Open my affiliate console"
            : "Send my application"}
        {!pending ? <ArrowRight className="h-4 w-4" /> : null}
      </button>

      <p className="text-center text-xs text-niki-ink/45">
        {payingNow
          ? "Your account opens as soon as the payment is confirmed."
          : route === "auto"
            ? "You're already a Nickimart trader, so you're in straight away."
            : "We review applications by hand, usually within a day."}
      </p>
    </form>
  );
}
