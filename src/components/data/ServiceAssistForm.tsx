"use client";

import { useActionState, useMemo, useState } from "react";
import { Check, Copy, Link2, Loader2, MessageCircle, UserPlus } from "lucide-react";
import { Field, inputClass } from "@/components/ui/Field";
import {
  registerCustomerForService,
  type AssistState,
} from "@/lib/data-bundles/service-assist";
import { formatPrice } from "@/lib/format";
import { cn } from "@/lib/cn";

/**
 * Registering a customer at the counter.
 *
 * The same form for an admin and for an agent, because it is the same job:
 * somebody is in front of you, or on WhatsApp, and would rather you did the
 * typing. The documents and the back-and-forth happen wherever they were
 * already happening; what comes out of here is a link to pay, which is the
 * only part that has to come back through Nickimart.
 *
 * Prices shown are whoever is signed in's own — an agent sees their ladder,
 * an admin sees Nickimart's — and the server re-reads both before it creates
 * anything, so what is displayed here cannot decide what is charged.
 */

export interface AssistOption {
  id: string;
  name: string;
  price: number;
  turnaround: string;
  /** Whether the ordinary speed is offered at all. */
  standardEnabled: boolean;
  /** The lanes that are open. A closed one never reaches here. */
  speeds: Array<{ key: string; label: string; extraFee: number; turnaround: string }>;
}

export interface AssistService {
  slug: string;
  name: string;
  variants: AssistOption[];
}

export function ServiceAssistForm({ services }: { services: AssistService[] }) {
  const [state, submit, saving] = useActionState<AssistState, FormData>(
    registerCustomerForService,
    {},
  );
  const [slug, setSlug] = useState(services[0]?.slug ?? "");
  const [variantId, setVariantId] = useState(services[0]?.variants[0]?.id ?? "");
  const [speedKey, setSpeedKey] = useState("");
  const [copied, setCopied] = useState(false);

  const service = useMemo(() => services.find((s) => s.slug === slug), [services, slug]);
  const variant = useMemo(
    () => service?.variants.find((v) => v.id === variantId) ?? service?.variants[0],
    [service, variantId],
  );
  // An option can be fast-track only, and then there is no standard to pick:
  // the first open lane is chosen rather than left blank.
  const effectiveSpeedKey =
    variant && !variant.standardEnabled && !variant.speeds.some((s) => s.key === speedKey)
      ? (variant.speeds[0]?.key ?? "")
      : speedKey;
  const speed = variant?.speeds.find((s) => s.key === effectiveSpeedKey);
  const total = (variant?.price ?? 0) + (speed?.extraFee ?? 0);

  function pickService(next: string) {
    setSlug(next);
    const first = services.find((s) => s.slug === next)?.variants[0];
    setVariantId(first?.id ?? "");
    setSpeedKey("");
  }

  async function copyLink() {
    if (!state.link) return;
    try {
      await navigator.clipboard.writeText(state.link);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      // Clipboard blocked — the link is on screen to copy by hand.
    }
  }

  if (services.length === 0) {
    return (
      <p className="rounded-xl bg-niki-surface px-4 py-3 text-sm text-niki-ink/55">
        Nothing to register for yet.
      </p>
    );
  }

  // The link is the whole output, so it replaces the form rather than sitting
  // under it: the next thing to do is send it, not fill the form again.
  if (state.ok && state.link) {
    return (
      <div className="animate-scale-in rounded-2xl bg-niki-success/[0.07] p-5 ring-1 ring-niki-success/25">
        <div className="flex items-center gap-2 text-niki-success">
          <Check className="h-5 w-5" />
          <p className="font-display font-bold">Order created</p>
        </div>
        <p className="mt-1 text-sm text-niki-ink/70">
          Reference <span className="font-mono font-semibold">{state.reference}</span>. Send this
          link — nothing starts until it is paid.
        </p>

        <div className="mt-3 flex flex-wrap items-center gap-2">
          <code className="min-w-0 flex-1 truncate rounded-xl bg-white px-4 py-2.5 font-mono text-xs text-niki-ink/70 ring-1 ring-niki-edge">
            {state.link}
          </code>
          <button
            type="button"
            onClick={copyLink}
            className="niki-press flex items-center gap-1.5 rounded-xl bg-niki-black px-4 py-2.5 text-sm font-semibold text-white"
          >
            {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
            {copied ? "Copied" : "Copy"}
          </button>
          <a
            href={`https://wa.me/?text=${encodeURIComponent(state.link)}`}
            target="_blank"
            rel="noopener noreferrer"
            className="niki-press flex items-center gap-1.5 rounded-xl bg-niki-ghana px-4 py-2.5 text-sm font-semibold text-white"
          >
            <MessageCircle className="h-4 w-4" />
            WhatsApp
          </a>
        </div>

        <button
          type="button"
          onClick={() => window.location.reload()}
          className="mt-4 text-sm font-semibold text-niki-orange hover:underline"
        >
          Register another customer
        </button>
      </div>
    );
  }

  return (
    <form action={submit} className="space-y-4">
      {state.error ? (
        <p className="animate-fade-up rounded-xl bg-niki-danger/10 px-4 py-3 text-sm font-medium text-niki-danger">
          {state.error}
        </p>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Service" htmlFor="assist-service">
          <select
            id="assist-service"
            name="serviceSlug"
            value={slug}
            onChange={(e) => pickService(e.target.value)}
            className={inputClass}
          >
            {services.map((s) => (
              <option key={s.slug} value={s.slug}>
                {s.name}
              </option>
            ))}
          </select>
        </Field>

        <Field label="Option" htmlFor="assist-variant">
          <select
            id="assist-variant"
            name="variantId"
            value={variant?.id ?? ""}
            onChange={(e) => {
              setVariantId(e.target.value);
              setSpeedKey("");
            }}
            className={inputClass}
          >
            {(service?.variants ?? []).map((v) => (
              <option key={v.id} value={v.id}>
                {v.name} — {formatPrice(v.price)}
              </option>
            ))}
          </select>
        </Field>
      </div>

      {variant && variant.speeds.length + (variant.standardEnabled ? 1 : 0) > 1 ? (
        <Field label="Delivery speed" htmlFor="assist-speed">
          <select
            id="assist-speed"
            name="speedKey"
            value={effectiveSpeedKey}
            onChange={(e) => setSpeedKey(e.target.value)}
            className={inputClass}
          >
            {variant.standardEnabled ? (
              <option value="">
                Standard{variant.turnaround ? ` — ${variant.turnaround}` : ""}
              </option>
            ) : null}
            {variant.speeds.map((s) => (
              <option key={s.key} value={s.key}>
                {s.label} — +{formatPrice(s.extraFee)}
                {s.turnaround ? ` · ${s.turnaround}` : ""}
              </option>
            ))}
          </select>
        </Field>
      ) : (
        <input type="hidden" name="speedKey" value={effectiveSpeedKey} />
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Customer name" htmlFor="assist-name">
          <input id="assist-name" name="customerName" required className={inputClass} />
        </Field>
        <Field label="Phone number" htmlFor="assist-phone" hint="How they are reached, and how they find the order">
          <input
            id="assist-phone"
            name="customerPhone"
            inputMode="tel"
            required
            placeholder="0241234567"
            className={inputClass}
          />
        </Field>
      </div>

      <Field label="Email" htmlFor="assist-email" hint="Optional — used for the payment receipt">
        <input id="assist-email" name="customerEmail" type="email" className={inputClass} />
      </Field>

      <Field label="Note" htmlFor="assist-note" hint="What was agreed, and where their documents are">
        <textarea id="assist-note" name="note" rows={2} className={inputClass} />
      </Field>

      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-niki-surface px-4 py-3">
        <span className="text-sm text-niki-ink/60">Amount to pay</span>
        <span className="font-figures text-xl font-bold text-niki-ink">{formatPrice(total)}</span>
      </div>

      <button
        type="submit"
        disabled={saving || !variant}
        className={cn(
          "niki-press flex w-full items-center justify-center gap-2 rounded-xl bg-niki-orange px-4 py-3 text-sm font-bold text-white hover:bg-niki-orange-light disabled:opacity-60",
        )}
      >
        {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <UserPlus className="h-4 w-4" />}
        {saving ? "Creating…" : "Create order & get payment link"}
      </button>

      <p className="flex items-start gap-1.5 text-xs text-niki-ink/45">
        <Link2 className="mt-0.5 h-3 w-3 shrink-0" />
        Nothing is charged here. The customer pays the link themselves, through the same checkout
        the website uses.
      </p>
    </form>
  );
}
