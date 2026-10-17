"use client";

import { useActionState, useState } from "react";
import {
  AlertTriangle,
  KeyRound,
  PackageCheck,
  Send,
  ShieldCheck,
  UserCheck,
} from "lucide-react";
import { Field, inputClass } from "@/components/ui/Field";
import { SubmitButton } from "@/components/ui/motion";
import { FormFeedback } from "@/components/ui/FormFeedback";
import { releaseParcel, sendCollectionCode, type ReleaseState } from "@/lib/pickup-actions";
import { cn } from "@/lib/cn";

/**
 * The counter.
 *
 * Somebody is standing in front of the operator asking for a parcel, and this
 * is the whole of what has to happen before they get it. It is one card rather
 * than a page because that is the shape of the moment: read the code, type it,
 * write down who they are, hand it over.
 *
 * Two deliberate pieces of friction, and only two. The code box comes first
 * and is the default path. "Somebody else is collecting" is one tap away
 * rather than hidden, because it is common and pretending otherwise just means
 * operators lying to the form — and choosing it is what makes the ID fields
 * required.
 */

const ID_TYPES = ["Ghana Card", "Passport", "Voter ID", "Driver's licence", "Other"];

export interface ReleaseCollection {
  hasLiveCode: boolean;
  codeHint: string;
  codeSentAt: string | null;
  attemptsLeft: number;
  locked: boolean;
  issued: number;
}

export function ReleaseParcel({
  orderId,
  orderNumber,
  buyerName,
  buyerPhoneMasked,
  collection,
  isAdmin,
}: {
  orderId: string;
  orderNumber: string;
  buyerName: string;
  buyerPhoneMasked: string;
  collection: ReleaseCollection | null;
  isAdmin: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [someoneElse, setSomeoneElse] = useState(false);
  const [override, setOverride] = useState(false);

  const [codeState, codeAction] = useActionState<ReleaseState, FormData>(sendCollectionCode, {});
  const [releaseState, releaseAction] = useActionState<ReleaseState, FormData>(releaseParcel, {});

  const live = collection?.hasLiveCode ?? false;

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="niki-press niki-focus flex items-center gap-1.5 rounded-full bg-niki-black px-4 py-2 text-xs font-semibold text-white transition-colors hover:bg-niki-black-soft"
      >
        <PackageCheck className="h-4 w-4 text-niki-orange" />
        Hand over
      </button>
    );
  }

  return (
    <div className="w-full rounded-2xl bg-niki-surface p-4 ring-1 ring-niki-edge">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <p className="flex items-center gap-1.5 text-sm font-semibold text-niki-ink">
          <ShieldCheck className="h-4 w-4 text-niki-orange" />
          Releasing {orderNumber}
        </p>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="niki-focus rounded-lg px-2 py-1 text-xs font-semibold text-niki-ink/55 hover:bg-niki-black/5"
        >
          Close
        </button>
      </div>

      {/* --- The code ------------------------------------------------------ */}
      <div className="rounded-xl bg-white p-3.5 ring-1 ring-niki-edge">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-wide text-niki-ink/45">
              Collection code
            </p>
            <p className="mt-0.5 text-xs text-niki-ink/60">
              {live ? (
                <>
                  Sent to {buyerName}, {buyerPhoneMasked}
                  {collection?.codeHint ? (
                    <>
                      {" "}
                      · ends <span className="font-semibold text-niki-ink">{collection.codeHint}</span>
                    </>
                  ) : null}
                </>
              ) : (
                <>No live code. Send one to {buyerPhoneMasked} before releasing.</>
              )}
            </p>
          </div>
          <form action={codeAction}>
            <input type="hidden" name="orderId" value={orderId} />
            <SubmitButton
              pendingLabel="Sending…"
              className="flex items-center gap-1.5 rounded-xl bg-white px-3 py-2 text-xs font-semibold text-niki-ink/75 ring-1 ring-niki-edge hover:bg-niki-black/5"
            >
              <Send className="h-3.5 w-3.5" />
              {live ? "Send again" : "Send code"}
            </SubmitButton>
          </form>
        </div>
        <FormFeedback error={codeState.error} success={codeState.ok ? codeState.message : undefined} className="mt-2.5" />
        {collection?.locked ? (
          <p className="mt-2.5 flex items-start gap-1.5 rounded-lg bg-amber-50 px-3 py-2 text-xs font-medium text-amber-800">
            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            Too many wrong codes. Send a fresh one to unlock it.
          </p>
        ) : live && collection && collection.attemptsLeft < 5 ? (
          <p className="mt-2.5 text-xs font-medium text-amber-700">
            {collection.attemptsLeft} {collection.attemptsLeft === 1 ? "try" : "tries"} left before
            it locks.
          </p>
        ) : null}
      </div>

      {/* --- Who is taking it ---------------------------------------------- */}
      <form action={releaseAction} className="mt-3 space-y-3">
        <input type="hidden" name="orderId" value={orderId} />

        {override ? null : (
          <Field
            label="Code from the buyer's text"
            htmlFor={`code-${orderId}`}
            hint="Six digits. Ask them to read it out rather than hand you the phone."
          >
            <input
              id={`code-${orderId}`}
              name="code"
              inputMode="numeric"
              autoComplete="off"
              placeholder="000 000"
              className={`${inputClass} font-figures tracking-[0.3em]`}
            />
          </Field>
        )}

        <div className="flex gap-1.5 rounded-xl bg-white p-1 ring-1 ring-niki-edge">
          <Choice active={!someoneElse} onClick={() => setSomeoneElse(false)} label="The buyer" />
          <Choice active={someoneElse} onClick={() => setSomeoneElse(true)} label="Someone else" />
        </div>
        <input
          type="hidden"
          name="collectorRelation"
          value={someoneElse ? "other" : "buyer"}
        />

        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Name" htmlFor={`cname-${orderId}`}>
            <input
              id={`cname-${orderId}`}
              name="collectorName"
              required
              defaultValue={someoneElse ? "" : buyerName}
              key={someoneElse ? "other" : "buyer"}
              className={inputClass}
            />
          </Field>
          <Field label="Phone" htmlFor={`cphone-${orderId}`}>
            <input
              id={`cphone-${orderId}`}
              name="collectorPhone"
              inputMode="tel"
              required
              placeholder="024 000 0000"
              className={inputClass}
            />
          </Field>
        </div>

        {someoneElse ? (
          <>
            <Field
              label="How do they know the buyer?"
              htmlFor={`crel-${orderId}`}
              hint="A word is enough — brother, driver, colleague."
            >
              <input
                id={`crel-${orderId}`}
                name="collectorRelationNote"
                placeholder="Brother"
                className={inputClass}
              />
            </Field>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="ID shown" htmlFor={`cidt-${orderId}`}>
                <select id={`cidt-${orderId}`} name="collectorIdType" required className={inputClass}>
                  <option value="">Choose…</option>
                  {ID_TYPES.map((t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="ID number" htmlFor={`cidn-${orderId}`}>
                <input
                  id={`cidn-${orderId}`}
                  name="collectorIdNumber"
                  required
                  className={inputClass}
                />
              </Field>
            </div>
          </>
        ) : null}

        {isAdmin ? (
          <div className="rounded-xl bg-white px-4 py-3 ring-1 ring-niki-edge">
            <label className="flex items-center gap-2.5 text-sm font-medium text-niki-ink">
              <input
                type="checkbox"
                name="override"
                checked={override}
                onChange={(e) => setOverride(e.target.checked)}
                className="h-4 w-4 accent-niki-orange"
              />
              Release without the code
            </label>
            {override ? (
              <div className="mt-2.5">
                <Field
                  label="Why"
                  htmlFor={`reason-${orderId}`}
                  hint="This stays on the order with your name against it."
                >
                  <textarea
                    id={`reason-${orderId}`}
                    name="overrideReason"
                    rows={2}
                    required
                    placeholder="Buyer lost the phone the code went to; identity confirmed against their Ghana Card."
                    className={`${inputClass} resize-y`}
                  />
                </Field>
              </div>
            ) : null}
          </div>
        ) : null}

        <FormFeedback
          error={releaseState.error}
          success={releaseState.ok ? releaseState.message : undefined}
        />

        <SubmitButton
          pendingLabel="Releasing…"
          className={cn(
            "flex w-full items-center justify-center gap-1.5 rounded-xl px-4 py-3 text-sm font-bold text-white",
            override ? "bg-amber-600 hover:bg-amber-500" : "bg-niki-orange hover:bg-niki-orange-light",
          )}
        >
          {override ? <KeyRound className="h-4 w-4" /> : <UserCheck className="h-4 w-4" />}
          {override ? "Release without a code" : "Verify and hand over"}
        </SubmitButton>
      </form>
    </div>
  );
}

function Choice({
  active,
  onClick,
  label,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "niki-focus flex-1 rounded-lg px-3 py-2 text-xs font-semibold transition-colors",
        active ? "bg-niki-black text-white" : "text-niki-ink/60 hover:bg-niki-black/5",
      )}
    >
      {label}
    </button>
  );
}
