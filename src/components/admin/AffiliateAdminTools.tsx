"use client";

import { useActionState, useTransition } from "react";
import { Check, Loader2, Pause, Play, RotateCcw, Undo2, X } from "lucide-react";
import {
  approveApplication,
  markPayoutProcessing,
  payAffiliatePayout,
  rejectAffiliatePayout,
  rejectApplication,
  releaseCommissionAdmin,
  resolveFraudFlag,
  reverseCommissionAdmin,
  setAffiliateStatus,
  setProductEligibility,
  type AdminActionState,
} from "@/lib/affiliate-admin-actions";
import { cn } from "@/lib/cn";

/**
 * The admin's controls, one per thing that can be decided.
 *
 * Each of these is a row-level action in a table, so each is as small as it can
 * be while still asking for what the action needs — a reason for a reversal, a
 * reference for a payment. The ones that cannot be undone open first rather
 * than firing on one click: `<details>` does that with no state to manage and
 * no focus trap to get wrong.
 */

const chip =
  "niki-press niki-focus inline-flex items-center gap-1 rounded-full px-2.5 py-1.5 text-[11px] font-bold transition-colors disabled:opacity-60";
const plain = "text-niki-ink/60 ring-1 ring-niki-edge-strong hover:bg-niki-surface";
const field =
  "h-9 w-full rounded-lg border border-niki-edge-strong bg-white px-2.5 text-xs text-niki-ink outline-none focus:border-niki-orange";

function Feedback({ state }: { state: AdminActionState }) {
  if (state.error) {
    return <p className="mt-1.5 text-[11px] font-semibold text-niki-danger">{state.error}</p>;
  }
  if (state.message) {
    return <p className="mt-1.5 text-[11px] font-semibold text-niki-success">{state.message}</p>;
  }
  return null;
}

// ---------------------------------------------------------------------------
// Affiliates
// ---------------------------------------------------------------------------

/** Suspend or reinstate, from the roster row. */
export function AffiliateStatusButton({
  id,
  status,
}: {
  id: string;
  status: string;
}) {
  const [pending, startTransition] = useTransition();
  const suspended = status === "suspended";

  if (suspended) {
    return (
      <button
        type="button"
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            const fd = new FormData();
            fd.set("id", id);
            fd.set("status", "active");
            await setAffiliateStatus(fd);
          })
        }
        className={cn(chip, "bg-niki-success text-white")}
      >
        {pending ? <Loader2 className="h-3 w-3 animate-spin" /> : <Play className="h-3 w-3" />}
        Reinstate
      </button>
    );
  }

  return (
    <details className="relative">
      <summary className={cn(chip, plain, "cursor-pointer list-none")}>
        <Pause className="h-3 w-3" />
        Suspend
      </summary>
      <form
        action={setAffiliateStatus}
        className="absolute right-0 top-full z-20 mt-1.5 w-64 rounded-xl bg-white p-3 shadow-lg ring-1 ring-niki-edge"
      >
        <input type="hidden" name="id" value={id} />
        <input type="hidden" name="status" value="suspended" />
        <label className="block text-[11px] font-semibold text-niki-ink/70">
          Why? The affiliate sees this.
          <input name="reason" maxLength={300} required className={cn(field, "mt-1")} />
        </label>
        <p className="mt-2 text-[10px] leading-relaxed text-niki-ink/45">
          Stops attribution on new orders. Commission already earned stays theirs.
        </p>
        <button type="submit" className={cn(chip, "mt-2 w-full justify-center bg-niki-danger text-white")}>
          Suspend
        </button>
      </form>
    </details>
  );
}

// ---------------------------------------------------------------------------
// Applications
// ---------------------------------------------------------------------------

export function ApplicationDecision({ id }: { id: string }) {
  const [approveState, approve, approving] = useActionState<AdminActionState, FormData>(
    approveApplication,
    {},
  );
  const [rejectState, reject, rejecting] = useActionState<AdminActionState, FormData>(
    rejectApplication,
    {},
  );

  return (
    <div>
      <div className="flex flex-wrap items-center gap-1.5">
        <form action={approve}>
          <input type="hidden" name="id" value={id} />
          <button type="submit" disabled={approving} className={cn(chip, "bg-niki-success text-white")}>
            {approving ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3" />}
            Approve
          </button>
        </form>

        <details className="relative">
          <summary className={cn(chip, plain, "cursor-pointer list-none")}>
            <X className="h-3 w-3" />
            Decline
          </summary>
          <form
            action={reject}
            className="absolute right-0 top-full z-20 mt-1.5 w-64 rounded-xl bg-white p-3 shadow-lg ring-1 ring-niki-edge"
          >
            <input type="hidden" name="id" value={id} />
            <label className="block text-[11px] font-semibold text-niki-ink/70">
              Reason — the applicant sees this.
              <input name="note" maxLength={500} className={cn(field, "mt-1")} />
            </label>
            <button
              type="submit"
              disabled={rejecting}
              className={cn(chip, "mt-2 w-full justify-center bg-niki-danger text-white")}
            >
              Decline application
            </button>
          </form>
        </details>
      </div>
      <Feedback state={approveState.error || approveState.message ? approveState : rejectState} />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Product eligibility
// ---------------------------------------------------------------------------

export function ProductEligibilityTool({
  id,
  enabled,
  enrolledBy,
  rate,
  platformCeiling,
  sellerCeiling,
}: {
  id: string;
  enabled: boolean;
  enrolledBy: string;
  rate: number | null;
  /** The most Nickimart will fund on this item. */
  platformCeiling: number;
  /** The most a seller can fund on it. */
  sellerCeiling: number;
}) {
  const [state, action, pending] = useActionState<AdminActionState, FormData>(
    setProductEligibility,
    {},
  );

  return (
    <div>
      <div className="flex flex-wrap items-center gap-1.5">
        <details className="relative">
          <summary className={cn(chip, enabled ? plain : "bg-niki-black text-white", "cursor-pointer list-none")}>
            {enabled ? "Edit" : "Enrol"}
          </summary>
          <form
            action={action}
            className="absolute right-0 top-full z-20 mt-1.5 w-72 rounded-xl bg-white p-3 shadow-lg ring-1 ring-niki-edge"
          >
            <input type="hidden" name="id" value={id} />
            <input type="hidden" name="action" value="enrol" />

            <label className="block text-[11px] font-semibold text-niki-ink/70">
              Who funds the commission?
              <select
                name="enrolledBy"
                defaultValue={enrolledBy || "admin"}
                className={cn(field, "mt-1")}
              >
                <option value="admin">Nickimart — out of our commission</option>
                <option value="seller">The seller — out of their margin</option>
              </select>
            </label>

            <label className="mt-2 block text-[11px] font-semibold text-niki-ink/70">
              Rate (%) — blank inherits the category, then the default
              <input
                name="rate"
                type="number"
                min="0"
                max="100"
                step="0.1"
                defaultValue={rate ?? ""}
                className={cn(field, "mt-1")}
              />
            </label>

            <p className="mt-2 text-[10px] leading-relaxed text-niki-ink/45">
              Nickimart funds at most {platformCeiling}% on this item — half of the platform
              commission. A seller may fund up to {sellerCeiling}%.
            </p>

            <button
              type="submit"
              disabled={pending}
              className={cn(chip, "mt-2 w-full justify-center bg-niki-orange text-white")}
            >
              {pending ? <Loader2 className="h-3 w-3 animate-spin" /> : null}
              Save
            </button>
          </form>
        </details>

        {enabled ? (
          <form action={action}>
            <input type="hidden" name="id" value={id} />
            <input type="hidden" name="action" value="withdraw" />
            <button type="submit" disabled={pending} className={cn(chip, plain)}>
              Withdraw
            </button>
          </form>
        ) : null}
      </div>
      <Feedback state={state} />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Payouts
// ---------------------------------------------------------------------------

export function PayoutDecision({
  id,
  status,
  amount,
}: {
  id: string;
  status: string;
  amount: string;
}) {
  const [payState, pay, paying] = useActionState<AdminActionState, FormData>(
    payAffiliatePayout,
    {},
  );
  const [rejectState, reject, rejecting] = useActionState<AdminActionState, FormData>(
    rejectAffiliatePayout,
    {},
  );
  const [pending, startTransition] = useTransition();

  if (status === "paid" || status === "rejected") return null;

  return (
    <div>
      <div className="flex flex-wrap items-center gap-1.5">
        <details className="relative">
          <summary className={cn(chip, "cursor-pointer list-none bg-niki-success text-white")}>
            <Check className="h-3 w-3" />
            Mark paid
          </summary>
          <form
            action={pay}
            className="absolute right-0 top-full z-20 mt-1.5 w-64 rounded-xl bg-white p-3 shadow-lg ring-1 ring-niki-edge"
          >
            <input type="hidden" name="id" value={id} />
            <label className="block text-[11px] font-semibold text-niki-ink/70">
              Transfer reference
              <input name="reference" maxLength={120} className={cn(field, "mt-1")} />
            </label>
            <p className="mt-2 text-[10px] leading-relaxed text-niki-ink/45">
              Confirms {amount} has been sent. The commission lines it covers are marked paid.
            </p>
            <button
              type="submit"
              disabled={paying}
              className={cn(chip, "mt-2 w-full justify-center bg-niki-success text-white")}
            >
              {paying ? <Loader2 className="h-3 w-3 animate-spin" /> : null}
              Confirm payment
            </button>
          </form>
        </details>

        {status === "pending" ? (
          <button
            type="button"
            disabled={pending}
            onClick={() =>
              startTransition(async () => {
                const fd = new FormData();
                fd.set("id", id);
                await markPayoutProcessing(fd);
              })
            }
            className={cn(chip, plain)}
          >
            {pending ? <Loader2 className="h-3 w-3 animate-spin" /> : null}
            Processing
          </button>
        ) : null}

        <details className="relative">
          <summary className={cn(chip, plain, "cursor-pointer list-none")}>
            <X className="h-3 w-3" />
            Decline
          </summary>
          <form
            action={reject}
            className="absolute right-0 top-full z-20 mt-1.5 w-64 rounded-xl bg-white p-3 shadow-lg ring-1 ring-niki-edge"
          >
            <input type="hidden" name="id" value={id} />
            <label className="block text-[11px] font-semibold text-niki-ink/70">
              Why? The affiliate sees this.
              <input name="reason" maxLength={300} required className={cn(field, "mt-1")} />
            </label>
            <p className="mt-2 text-[10px] leading-relaxed text-niki-ink/45">
              The commission it claimed goes back to payable, so they can ask again.
            </p>
            <button
              type="submit"
              disabled={rejecting}
              className={cn(chip, "mt-2 w-full justify-center bg-niki-danger text-white")}
            >
              Decline request
            </button>
          </form>
        </details>
      </div>
      <Feedback state={payState.error || payState.message ? payState : rejectState} />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Commissions
// ---------------------------------------------------------------------------

export function CommissionTool({
  id,
  status,
  lineValue,
  reversed,
}: {
  id: string;
  status: string;
  /** The line's value, so a partial refund can be entered against it. */
  lineValue: string;
  reversed: boolean;
}) {
  const [reverseState, doReverse, reversing] = useActionState<AdminActionState, FormData>(
    reverseCommissionAdmin,
    {},
  );
  const [releaseState, doRelease, releasing] = useActionState<AdminActionState, FormData>(
    releaseCommissionAdmin,
    {},
  );

  return (
    <div>
      <div className="flex flex-wrap items-center gap-1.5">
        {!reversed ? (
          <details className="relative">
            <summary className={cn(chip, plain, "cursor-pointer list-none")}>
              <RotateCcw className="h-3 w-3" />
              Reverse
            </summary>
            <form
              action={doReverse}
              className="absolute right-0 top-full z-20 mt-1.5 w-72 rounded-xl bg-white p-3 shadow-lg ring-1 ring-niki-edge"
            >
              <input type="hidden" name="id" value={id} />
              <label className="block text-[11px] font-semibold text-niki-ink/70">
                What happened?
                <select name="kind" defaultValue="refund" className={cn(field, "mt-1")}>
                  <option value="refund">Refunded</option>
                  <option value="return">Returned</option>
                  <option value="cancellation">Cancelled</option>
                  <option value="correction">Correction</option>
                  <option value="clawback">Clawback</option>
                </select>
              </label>
              <label className="mt-2 block text-[11px] font-semibold text-niki-ink/70">
                Amount refunded (GH₵) — blank reverses the whole line
                <input
                  name="refundedValue"
                  type="number"
                  min="0"
                  step="0.01"
                  placeholder={lineValue}
                  className={cn(field, "mt-1")}
                />
              </label>
              <label className="mt-2 block text-[11px] font-semibold text-niki-ink/70">
                Reason
                <input name="reason" maxLength={300} required className={cn(field, "mt-1")} />
              </label>
              <p className="mt-2 text-[10px] leading-relaxed text-niki-ink/45">
                A partial refund takes back its share of the commission, not all of it.
              </p>
              <button
                type="submit"
                disabled={reversing}
                className={cn(chip, "mt-2 w-full justify-center bg-niki-danger text-white")}
              >
                {reversing ? <Loader2 className="h-3 w-3 animate-spin" /> : null}
                Reverse commission
              </button>
            </form>
          </details>
        ) : (
          <details className="relative">
            <summary className={cn(chip, plain, "cursor-pointer list-none")}>
              <Undo2 className="h-3 w-3" />
              Undo
            </summary>
            <form
              action={doRelease}
              className="absolute right-0 top-full z-20 mt-1.5 w-64 rounded-xl bg-white p-3 shadow-lg ring-1 ring-niki-edge"
            >
              <input type="hidden" name="id" value={id} />
              <label className="block text-[11px] font-semibold text-niki-ink/70">
                Reason
                <input name="reason" maxLength={300} className={cn(field, "mt-1")} />
              </label>
              <p className="mt-2 text-[10px] leading-relaxed text-niki-ink/45">
                Puts the line back into the lifecycle — the order decides where it belongs.
              </p>
              <button
                type="submit"
                disabled={releasing}
                className={cn(chip, "mt-2 w-full justify-center bg-niki-success text-white")}
              >
                Undo the reversal
              </button>
            </form>
          </details>
        )}
        {status === "paid" ? (
          <span className="text-[10px] font-semibold text-niki-ink/40">settled</span>
        ) : null}
      </div>
      <Feedback state={reverseState.error || reverseState.message ? reverseState : releaseState} />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Abuse
// ---------------------------------------------------------------------------

export function FlagDecision({ id, status }: { id: string; status: string }) {
  const [pending, startTransition] = useTransition();

  function set(next: string) {
    startTransition(async () => {
      const fd = new FormData();
      fd.set("id", id);
      fd.set("status", next);
      await resolveFraudFlag(fd);
    });
  }

  if (status !== "open") {
    return (
      <button type="button" disabled={pending} onClick={() => set("open")} className={cn(chip, plain)}>
        {pending ? <Loader2 className="h-3 w-3 animate-spin" /> : <Undo2 className="h-3 w-3" />}
        Reopen
      </button>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <button
        type="button"
        disabled={pending}
        onClick={() => set("cleared")}
        className={cn(chip, "bg-niki-success text-white")}
      >
        {pending ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3" />}
        Nothing in it
      </button>
      <button
        type="button"
        disabled={pending}
        onClick={() => set("upheld")}
        className={cn(chip, plain)}
      >
        Upheld
      </button>
    </div>
  );
}
