"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, ArrowRight, Bookmark, Check, Clock3, CreditCard, Loader2, Paperclip } from "lucide-react";
import { Field, inputClass } from "@/components/ui/Field";
import { BusyButton } from "@/components/ui/motion";
import {
  orderService,
  saveServiceDraft,
  type LoadedDraft,
} from "@/lib/data-bundles/service-actions";
import { openSpeeds } from "@/lib/data-bundles/service-fields";
import type { ServiceField, ServiceSpeed } from "@/lib/data-bundles/service-fields";
import { formatMoney, formatPrice } from "@/lib/format";
import { cn } from "@/lib/cn";

/**
 * Applying for a service.
 *
 * Four steps, because the alternative is one page asking twenty questions
 * before saying what it costs. Choose what you want, fill in the form, read
 * what you are agreeing to, pay. The price is on screen from the first step
 * and follows every change, so nothing about the total arrives late.
 *
 * Two things it deliberately does not do. It never uploads a document: the
 * form asks for text, and the files are attached afterwards against an order
 * that has been paid for — nothing of a customer's is stored before then. And
 * it never decides a price; the server re-reads the variant and the speed at
 * the moment of purchase, so what is shown here is a quote, not a contract.
 */

export interface ApplyVariant {
  id: string;
  name: string;
  description: string;
  price: number;
  turnaround: string;
  /** Whether the ordinary speed is offered at all. */
  standardEnabled: boolean;
  speeds: ServiceSpeed[];
  fields: ServiceField[];
}

export interface ApplyService {
  slug: string;
  name: string;
  summary: string;
  fields: ServiceField[];
  terms: string[];
  variants: ApplyVariant[];
}

type Step = "choose" | "form" | "terms" | "done";

function FieldInput({
  field,
  value,
  onChange,
}: {
  field: ServiceField;
  value: string;
  onChange: (next: string) => void;
}) {
  const id = `f-${field.key}`;
  const common = { id, value, className: inputClass, required: field.required };

  return (
    <div className={field.half ? "" : "sm:col-span-2"}>
      <Field
        label={field.required ? `${field.label} *` : field.label}
        htmlFor={id}
        hint={field.hint || undefined}
      >
        {field.type === "textarea" ? (
          <textarea {...common} rows={3} onChange={(e) => onChange(e.target.value)} />
        ) : field.type === "select" ? (
          <select {...common} onChange={(e) => onChange(e.target.value)}>
            <option value="">Choose…</option>
            {field.options.map((o) => (
              <option key={o} value={o}>
                {o}
              </option>
            ))}
          </select>
        ) : (
          <input
            {...common}
            type={
              field.type === "date"
                ? "date"
                : field.type === "email"
                  ? "email"
                  : field.type === "number"
                    ? "number"
                    : "text"
            }
            inputMode={field.type === "phone" ? "tel" : undefined}
            onChange={(e) => onChange(e.target.value)}
          />
        )}
      </Field>
    </div>
  );
}

export function ServiceApplyForm({
  service,
  storeSlug,
  draft,
}: {
  service: ApplyService;
  /** Applying through an agent's storefront. */
  storeSlug?: string;
  /** A part-filled application being picked back up. */
  draft?: LoadedDraft | null;
}) {
  const router = useRouter();
  const [step, setStep] = useState<Step>("choose");
  const [variantId, setVariantId] = useState(draft?.variantId || service.variants[0]?.id || "");
  const [speedKey, setSpeedKey] = useState(draft?.speedKey ?? "");
  const [name, setName] = useState(draft?.customerName ?? "");
  const [phone, setPhone] = useState(draft?.customerPhone ?? "");
  const [email, setEmail] = useState(draft?.customerEmail ?? "");
  const [answers, setAnswers] = useState<Record<string, string>>(draft?.answers ?? {});
  const [accepted, setAccepted] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [savedCode, setSavedCode] = useState<string | null>(draft?.code ?? null);
  const [saving, setSaving] = useState(false);

  const variant = useMemo(
    () => service.variants.find((v) => v.id === variantId) ?? service.variants[0],
    [service.variants, variantId],
  );

  // Only the lanes that are actually open, and the ordinary one only when the
  // option offers it. An option can be fast-track only, and then there is no
  // "Standard" to pick and one of the faster lanes is chosen for them.
  const lanes = useMemo(() => openSpeeds(variant?.speeds ?? []), [variant]);
  const effectiveSpeedKey =
    variant && !variant.standardEnabled && !lanes.some((l) => l.key === speedKey)
      ? (lanes[0]?.key ?? "")
      : speedKey;

  const speed = lanes.find((s) => s.key === effectiveSpeedKey) ?? null;
  const total = (variant?.price ?? 0) + (speed?.extraFee ?? 0);
  const turnaround = speed?.turnaround || variant?.turnaround || "";

  // The service's own questions, then the chosen option's.
  const fields = useMemo(
    () => [...service.fields, ...(variant?.fields ?? [])],
    [service.fields, variant],
  );
  const textFields = fields.filter((f) => f.type !== "file");
  const documents = fields.filter((f) => f.type === "file");

  function set(key: string, value: string) {
    setAnswers((a) => ({ ...a, [key]: value }));
  }

  async function save() {
    setError(null);
    setSaving(true);
    const result = await saveServiceDraft({
      serviceSlug: service.slug,
      variantId,
      speedKey: effectiveSpeedKey,
      customerName: name,
      customerPhone: phone,
      customerEmail: email,
      answers,
      code: savedCode ?? undefined,
    });
    setSaving(false);
    if (!result.ok) return setError(result.error);
    setSavedCode(result.code);
  }

  async function submit() {
    setError(null);
    setPending(true);
    const result = await orderService({
      serviceSlug: service.slug,
      variantId,
      speedKey: effectiveSpeedKey,
      customerName: name,
      customerPhone: phone,
      customerEmail: email,
      answers,
      acceptedTerms: true,
      storeSlug,
      draftCode: savedCode ?? undefined,
    });
    if (!result.ok) {
      setError(result.error);
      setPending(false);
      return;
    }
    if (result.authorizationUrl) {
      // Hand over to Paystack. Stay pending — the spinner should survive right
      // up to the redirect.
      window.location.href = result.authorizationUrl;
      return;
    }
    router.push(`/data-bundles/services/order/${encodeURIComponent(result.reference)}?paid=1`);
  }

  function goToForm() {
    if (!variant) return setError("Choose an option to continue.");
    setError(null);
    setStep("form");
  }

  function goToTerms(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim() || !phone.trim()) {
      return setError("Your name and phone number are needed to reach you.");
    }
    setError(null);
    setStep("terms");
  }

  if (service.variants.length === 0) {
    return (
      <p className="rounded-2xl bg-niki-surface px-4 py-3 text-sm text-niki-ink/60">
        This service isn&apos;t taking applications at the moment.
      </p>
    );
  }

  return (
    <div>
      {/* Where you are. Four words, not a progress bar — the steps are short. */}
      <ol className="mb-5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs font-semibold">
        {(["choose", "form", "terms"] as const).map((s, i) => {
          const order: Step[] = ["choose", "form", "terms"];
          const done = order.indexOf(step) > i;
          const now = step === s;
          return (
            <li key={s} className="flex items-center gap-2">
              <span
                className={cn(
                  "flex h-6 w-6 items-center justify-center rounded-full text-[11px]",
                  now
                    ? "bg-niki-orange text-white"
                    : done
                      ? "bg-niki-success/15 text-niki-success"
                      : "bg-niki-surface text-niki-ink/40",
                )}
              >
                {done ? <Check className="h-3 w-3" /> : i + 1}
              </span>
              <span className={cn(now ? "text-niki-ink" : "text-niki-ink/45")}>
                {s === "choose" ? "Choose" : s === "form" ? "Your details" : "Terms & payment"}
              </span>
              {i < 2 ? <span className="text-niki-ink/20">›</span> : null}
            </li>
          );
        })}
      </ol>

      {error ? (
        <p className="animate-fade-up mb-4 rounded-xl bg-niki-danger/10 px-4 py-3 text-sm font-medium text-niki-danger">
          {error}
        </p>
      ) : null}

      {savedCode ? (
        <p className="animate-fade-up mb-4 rounded-xl bg-niki-trust/10 px-4 py-3 text-sm text-niki-ink/75 ring-1 ring-niki-trust/25">
          Saved. Come back any time with the code{" "}
          <span className="font-mono font-bold text-niki-ink">{savedCode}</span> — write it down.
        </p>
      ) : null}

      {/* 1 — what you want */}
      {step === "choose" ? (
        <div className="space-y-4">
          <div className="space-y-2.5">
            {service.variants.map((v) => {
              const chosen = v.id === variantId;
              return (
                <button
                  key={v.id}
                  type="button"
                  onClick={() => {
                    setVariantId(v.id);
                    setSpeedKey("");
                  }}
                  aria-pressed={chosen}
                  className={cn(
                    "niki-press niki-focus flex w-full items-start gap-3 rounded-2xl px-4 py-3.5 text-left transition-colors",
                    chosen
                      ? "bg-niki-orange/[0.07] ring-2 ring-niki-orange"
                      : "bg-white ring-1 ring-niki-edge hover:ring-niki-edge-strong",
                  )}
                >
                  <span
                    className={cn(
                      "mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full ring-2",
                      chosen ? "bg-niki-orange ring-niki-orange" : "ring-niki-edge-strong",
                    )}
                  >
                    {chosen ? <span className="h-1.5 w-1.5 rounded-full bg-white" /> : null}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block font-display font-bold text-niki-ink">{v.name}</span>
                    {v.description ? (
                      <span className="mt-0.5 block text-xs text-niki-ink/55">{v.description}</span>
                    ) : null}
                    {v.standardEnabled ? v.turnaround : openSpeeds(v.speeds)[0]?.turnaround ? (
                      <span className="mt-1 flex items-center gap-1 text-[11px] font-medium text-niki-ink/45">
                        <Clock3 className="h-3 w-3" />
                        {v.standardEnabled ? v.turnaround : openSpeeds(v.speeds)[0]?.turnaround}
                        {!v.standardEnabled ? " · fast track only" : ""}
                      </span>
                    ) : null}
                  </span>
                  <span className="shrink-0 font-figures font-bold text-niki-ink">
                    {formatMoney(v.price + (v.standardEnabled ? 0 : openSpeeds(v.speeds)[0]?.extraFee ?? 0))}
                  </span>
                </button>
              );
            })}
          </div>

          {/* Shown only when there is a decision to make: one lane on its own
              is not a choice, it is the turnaround, and it is already on the
              option above. */}
          {variant && lanes.length + (variant.standardEnabled ? 1 : 0) > 1 ? (
            <div>
              <p className="mb-2 text-sm font-medium text-niki-ink">How fast do you need it?</p>
              <div className="grid gap-2 sm:grid-cols-2">
                {variant.standardEnabled ? (
                  <button
                    type="button"
                    onClick={() => setSpeedKey("")}
                    aria-pressed={effectiveSpeedKey === ""}
                    className={cn(
                      "niki-press niki-focus rounded-xl px-4 py-3 text-left",
                      effectiveSpeedKey === ""
                        ? "bg-niki-orange/[0.07] ring-2 ring-niki-orange"
                        : "bg-white ring-1 ring-niki-edge",
                    )}
                  >
                    <span className="block text-sm font-bold text-niki-ink">Standard</span>
                    <span className="mt-0.5 block text-xs text-niki-ink/55">
                      {variant.turnaround || "Usual turnaround"} · no extra charge
                    </span>
                  </button>
                ) : null}
                {lanes.map((s) => (
                  <button
                    key={s.key}
                    type="button"
                    onClick={() => setSpeedKey(s.key)}
                    aria-pressed={effectiveSpeedKey === s.key}
                    className={cn(
                      "niki-press niki-focus rounded-xl px-4 py-3 text-left",
                      effectiveSpeedKey === s.key
                        ? "bg-niki-orange/[0.07] ring-2 ring-niki-orange"
                        : "bg-white ring-1 ring-niki-edge",
                    )}
                  >
                    <span className="block text-sm font-bold text-niki-ink">{s.label}</span>
                    <span className="mt-0.5 block text-xs text-niki-ink/55">
                      {s.turnaround || "Faster"} · +{formatMoney(s.extraFee)}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          ) : null}

          <Total total={total} turnaround={turnaround} />

          <button
            type="button"
            onClick={goToForm}
            className="niki-press flex w-full items-center justify-center gap-2 rounded-xl bg-niki-orange px-4 py-3.5 text-sm font-bold text-white hover:bg-niki-orange-light"
          >
            Continue
            <ArrowRight className="h-4 w-4" />
          </button>
        </div>
      ) : null}

      {/* 2 — who you are, and what the form asks */}
      {step === "form" ? (
        <form onSubmit={goToTerms} className="space-y-5" noValidate>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Your full name *" htmlFor="apply-name">
              <input
                id="apply-name"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                className={inputClass}
              />
            </Field>
            <Field label="Phone number *" htmlFor="apply-phone" hint="How we reach you, and how you track this">
              <input
                id="apply-phone"
                inputMode="tel"
                required
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="0241234567"
                className={inputClass}
              />
            </Field>
            <div className="sm:col-span-2">
              <Field label="Email" htmlFor="apply-email" hint="Optional — for the payment receipt">
                <input
                  id="apply-email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className={inputClass}
                />
              </Field>
            </div>
          </div>

          {textFields.length > 0 ? (
            <div className="grid gap-4 border-t border-niki-edge pt-5 sm:grid-cols-2">
              {textFields.map((f) => (
                <FieldInput
                  key={f.key}
                  field={f}
                  value={answers[f.key] ?? ""}
                  onChange={(v) => set(f.key, v)}
                />
              ))}
            </div>
          ) : null}

          {documents.length > 0 ? (
            <div className="rounded-2xl bg-niki-surface px-4 py-3.5">
              <p className="flex items-center gap-1.5 text-sm font-semibold text-niki-ink">
                <Paperclip className="h-4 w-4 text-niki-ink/45" />
                Documents needed
              </p>
              <ul className="mt-1.5 list-inside list-disc text-xs text-niki-ink/60">
                {documents.map((d) => (
                  <li key={d.key}>{d.label}</li>
                ))}
              </ul>
              <p className="mt-2 text-xs text-niki-ink/50">
                You attach these after payment — nothing is stored before then.
              </p>
            </div>
          ) : null}

          <Total total={total} turnaround={turnaround} />

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setStep("choose")}
              className="niki-press flex items-center gap-1.5 rounded-xl bg-niki-surface px-4 py-3 text-sm font-bold text-niki-ink/70 hover:bg-niki-black/5"
            >
              <ArrowLeft className="h-4 w-4" />
              Back
            </button>
            <button
              type="button"
              onClick={save}
              disabled={saving}
              className="niki-press flex items-center gap-1.5 rounded-xl bg-niki-surface px-4 py-3 text-sm font-bold text-niki-ink/70 hover:bg-niki-black/5 disabled:opacity-60"
            >
              {saving ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Bookmark className="h-4 w-4" />
              )}
              Save for later
            </button>
            <button
              type="submit"
              className="niki-press flex flex-1 items-center justify-center gap-2 rounded-xl bg-niki-orange px-4 py-3 text-sm font-bold text-white hover:bg-niki-orange-light"
            >
              Continue
              <ArrowRight className="h-4 w-4" />
            </button>
          </div>
        </form>
      ) : null}

      {/* 3 — what you are agreeing to, then pay */}
      {step === "terms" ? (
        <div className="space-y-4">
          <dl className="rounded-2xl bg-niki-surface p-4 text-sm">
            <div className="flex items-center justify-between py-1">
              <dt className="text-niki-ink/55">Service</dt>
              <dd className="font-semibold text-niki-ink">{service.name}</dd>
            </div>
            <div className="flex items-center justify-between py-1">
              <dt className="text-niki-ink/55">Option</dt>
              <dd className="font-semibold text-niki-ink">{variant?.name}</dd>
            </div>
            {speed ? (
              <div className="flex items-center justify-between py-1">
                <dt className="text-niki-ink/55">Speed</dt>
                <dd className="font-semibold text-niki-ink">{speed.label}</dd>
              </div>
            ) : null}
            {turnaround ? (
              <div className="flex items-center justify-between py-1">
                <dt className="text-niki-ink/55">Turnaround</dt>
                <dd className="font-semibold text-niki-ink">{turnaround}</dd>
              </div>
            ) : null}
            <div className="flex items-center justify-between border-t border-niki-edge pt-2">
              <dt className="text-niki-ink/55">Amount to pay</dt>
              <dd className="font-figures text-lg font-bold text-niki-orange">
                {formatPrice(total)}
              </dd>
            </div>
          </dl>

          {service.terms.length > 0 ? (
            <div className="max-h-56 overflow-y-auto rounded-2xl bg-white p-4 ring-1 ring-niki-edge">
              <p className="mb-2 text-sm font-semibold text-niki-ink">Terms</p>
              <ul className="space-y-1.5 text-xs leading-relaxed text-niki-ink/65">
                {service.terms.map((t, i) => (
                  <li key={i} className="flex gap-2">
                    <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-niki-ink/30" />
                    {t}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          <label className="flex cursor-pointer items-start gap-3 rounded-2xl bg-niki-surface px-4 py-3">
            <input
              type="checkbox"
              checked={accepted}
              onChange={(e) => setAccepted(e.target.checked)}
              className="mt-0.5 h-4 w-4 accent-[var(--color-niki-orange,#ff6a00)]"
            />
            <span className="text-sm text-niki-ink/75">
              I accept the terms above and confirm the details I have given are correct.
            </span>
          </label>

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setStep("form")}
              disabled={pending}
              className="niki-press flex items-center gap-1.5 rounded-xl bg-niki-surface px-4 py-3 text-sm font-bold text-niki-ink/70 hover:bg-niki-black/5 disabled:opacity-60"
            >
              <ArrowLeft className="h-4 w-4" />
              Back
            </button>
            <BusyButton
              type="button"
              busy={pending}
              disabled={!accepted}
              onClick={submit}
              pendingLabel="Opening Paystack…"
              icon={<CreditCard className="h-4 w-4" />}
              className="flex-1 whitespace-nowrap rounded-xl bg-niki-orange px-4 py-3 text-sm font-bold text-white hover:bg-niki-orange-light"
            >
              {`Pay ${formatPrice(total)}`}
            </BusyButton>
          </div>

          <p className="text-center text-[11px] text-niki-ink/40">
            Secured by Paystack · MTN MoMo, Telecel Cash, AT Money &amp; cards
          </p>
        </div>
      ) : null}
    </div>
  );
}

/** The running total, on screen from the first step so nothing arrives late. */
function Total({ total, turnaround }: { total: number; turnaround: string }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 rounded-2xl bg-niki-surface px-4 py-3">
      <span className="text-sm text-niki-ink/60">
        Total
        {turnaround ? (
          <span className="ml-2 inline-flex items-center gap-1 text-xs text-niki-ink/45">
            <Clock3 className="h-3 w-3" />
            {turnaround}
          </span>
        ) : null}
      </span>
      <span className="font-figures text-xl font-bold text-niki-ink">{formatPrice(total)}</span>
    </div>
  );
}
