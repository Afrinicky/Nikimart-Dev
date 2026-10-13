"use client";

import { useActionState } from "react";
import Link from "next/link";
import { Check, Minus } from "lucide-react";
import { Field, inputClass } from "@/components/ui/Field";
import { SubmitButton } from "@/components/auth/SubmitButton";
import { FormFeedback } from "@/components/ui/FormFeedback";
import {
  testCarrierConnection,
  updateDeveloperSettings,
  type DeveloperSettingsState,
} from "@/lib/data-bundles/developer-actions";
import { codeFieldName, productCodesSubmittedField } from "@/lib/data-bundles/carriers/products";
import type { Network } from "@/lib/data-bundles/networks";

/**
 * The Developer tab: how each network is fulfilled, the product codes behind
 * that, and a read-only view of what the environment is holding.
 *
 * Everything on this page is built from the carrier registry and the price
 * ladder, not from a list written here. A network with no carrier yet renders
 * as exactly that; a carrier that arrives brings its own route switch, its own
 * environment panel and — if it uses them — its own product codes, without
 * this file changing.
 *
 * Credentials are not editable here and never arrive here. The server sends
 * only whether each variable is set — never a value, not even a masked one —
 * so there is nothing on this page for a shared screen, a browser extension or
 * a support session to pick up. Changing one is a Vercel edit and a redeploy.
 *
 * What stays editable is what must be changeable now: the switches, because
 * turning a route off is how you stop it, and the product codes, because a new
 * bundle size needs a code the same afternoon.
 */

export interface EnvVarView {
  name: string;
  label: string;
  required: boolean;
  set: boolean;
  fallback?: string;
}

export interface ProductRowView {
  sizeGb: number;
  code: string;
  isActive: boolean;
}

/** One network, as the console needs to show it. */
export interface NetworkView {
  network: Network;
  label: string;
  /** The carrier that could deliver it, or null when none does yet. */
  carrierId: string | null;
  carrierLabel: string | null;
  /** Whether that carrier is currently selected for this network. */
  live: boolean;
  /** Whether the carrier's environment is complete. */
  ready: boolean;
  /** Environment variables still needed. Never values. */
  missing: string[];
  usesProductCodes: boolean;
  /** One row per bundle in this network's ladder, smallest first. */
  ladder: ProductRowView[];
  /** Codes whose bundle is no longer in the ladder. */
  orphans: ProductRowView[];
  productProblems: string[];
  /** Sizes on sale with no code yet. */
  unmapped: number[];
  mappedCount: number;
}

/** One carrier's environment, for the status panel. */
export interface CarrierView {
  id: string;
  label: string;
  env: EnvVarView[];
  hasTest: boolean;
  /** The URL to register as this carrier's callback, where it has one. */
  callbackUrl: string;
}

export interface DeveloperSettingsView {
  networks: NetworkView[];
  carriers: CarrierView[];
}

function EnvRow({ v }: { v: EnvVarView }) {
  return (
    <li className="flex items-start gap-3 py-2">
      <span
        className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full ${
          v.set
            ? "bg-niki-success/15 text-niki-success"
            : v.required
              ? "bg-niki-danger/15 text-niki-danger"
              : "bg-niki-ink/10 text-niki-ink/40"
        }`}
        aria-hidden
      >
        {v.set ? <Check className="h-3 w-3" /> : <Minus className="h-3 w-3" />}
      </span>
      <span className="min-w-0">
        <span className="block font-mono text-xs font-medium text-niki-ink">{v.name}</span>
        <span className="block text-xs text-niki-ink/55">
          {v.label}
          {v.set ? (
            <span className="sr-only"> — set</span>
          ) : v.required ? (
            <span className="font-medium text-niki-danger"> — required, not set</span>
          ) : v.fallback ? (
            <span> — not set, using {v.fallback}</span>
          ) : (
            <span> — not set, omitted from the request</span>
          )}
        </span>
      </span>
    </li>
  );
}

/** One network's route switch, or the reason it has none. */
function RouteRow({
  n,
  formAction,
  state,
}: {
  n: NetworkView;
  formAction: (fd: FormData) => void;
  state: DeveloperSettingsState;
}) {
  if (!n.carrierId) {
    return (
      <li className="flex items-center justify-between gap-4 p-4">
        <span>
          <span className="block font-display text-sm font-bold text-niki-ink">{n.label}</span>
          <span className="block text-xs text-niki-ink/55">
            No direct carrier API yet — delivered by the current provider.
          </span>
        </span>
      </li>
    );
  }

  return (
    <li className={`p-4 ${n.live ? "bg-niki-success/5" : ""}`}>
      <form action={formAction} className="space-y-3" noValidate>
        <div className="flex flex-wrap items-end gap-3">
          <span className="min-w-[8rem] flex-1">
            <span className="block font-display text-sm font-bold text-niki-ink">{n.label}</span>
            <span className="block text-xs text-niki-ink/55">
              {n.live
                ? `Delivered by ${n.carrierLabel}.`
                : "Delivered by the current provider."}
              {n.missing.length > 0 ? ` Not set: ${n.missing.join(", ")}.` : ""}
            </span>
          </span>
          <span className="w-full sm:w-72">
            <Field label="" htmlFor={`dataRoute${n.network}`}>
              <select
                id={`dataRoute${n.network}`}
                name={`dataRoute${n.network}`}
                defaultValue={n.live ? (n.carrierId ?? "JUSTICE") : "JUSTICE"}
                aria-label={`How ${n.label} bundles are delivered`}
                className={inputClass}
              >
                <option value="JUSTICE">The current provider — no change</option>
                <option value={n.carrierId}>{n.carrierLabel}</option>
              </select>
            </Field>
          </span>
          <SubmitButton>Save</SubmitButton>
        </div>
        <FormFeedback
          error={state.error}
          success={state.ok ? (state.notice ?? "Saved.") : undefined}
        />
      </form>
    </li>
  );
}

/** One network's size-to-code list, built from its own price ladder. */
function ProductCodes({
  n,
  formAction,
}: {
  n: NetworkView;
  formAction: (fd: FormData) => void;
}) {
  return (
    <section className="rounded-2xl bg-white p-6 ring-1 ring-niki-edge">
      <h2 className="font-display text-lg font-bold text-niki-ink">
        {n.label} product codes
      </h2>
      <p className="mt-1 text-sm text-niki-ink/60">
        Which {n.carrierLabel} product each bundle corresponds to. The rows come straight from the
        price ladder, so adding a bundle on the{" "}
        <Link href="/admin/data/bundles" className="font-medium text-niki-orange hover:underline">
          Bundle prices
        </Link>{" "}
        tab puts it here automatically. A size left blank is sent to the current provider instead,
        never guessed at.
      </p>

      <form action={formAction} className="mt-4 space-y-4" noValidate>
        <input type="hidden" name={productCodesSubmittedField(n.network)} value="1" />

        {n.ladder.length === 0 ? (
          <p className="rounded-xl bg-niki-ink/5 px-4 py-6 text-center text-sm text-niki-ink/60">
            No {n.label} bundles in the price ladder yet. Add one on the Bundle prices tab and it
            will appear here.
          </p>
        ) : (
          <ul className="divide-y divide-niki-edge rounded-xl ring-1 ring-niki-edge">
            {n.ladder.map((row) => (
              <li key={row.sizeGb} className="flex items-center gap-3 p-3">
                <span className="flex w-24 shrink-0 flex-col">
                  <span className="font-display text-sm font-bold text-niki-ink">
                    {row.sizeGb}GB
                  </span>
                  {row.isActive ? null : (
                    <span className="text-[11px] font-medium text-niki-ink/45">not on sale</span>
                  )}
                </span>
                <input
                  name={codeFieldName(n.network, row.sizeGb)}
                  defaultValue={row.code}
                  placeholder={`${n.carrierLabel} product code`}
                  aria-label={`${n.carrierLabel} product code for the ${row.sizeGb}GB bundle`}
                  autoComplete="off"
                  className={`${inputClass} font-mono`}
                />
              </li>
            ))}
          </ul>
        )}

        {n.orphans.length > 0 ? (
          <div className="rounded-xl bg-niki-ink/5 p-3">
            <p className="text-xs font-semibold text-niki-ink">No longer in the price ladder</p>
            <p className="mt-0.5 text-xs text-niki-ink/55">
              These bundles have been removed or resized. Their codes are kept in case the size
              comes back — clear a field to drop it for good.
            </p>
            <ul className="mt-2 space-y-2">
              {n.orphans.map((row) => (
                <li key={row.sizeGb} className="flex items-center gap-3">
                  <span className="w-24 shrink-0 text-sm font-medium text-niki-ink/60">
                    {row.sizeGb}GB
                  </span>
                  <input
                    name={codeFieldName(n.network, row.sizeGb)}
                    defaultValue={row.code}
                    aria-label={`Product code kept for ${row.sizeGb}GB`}
                    autoComplete="off"
                    className={`${inputClass} font-mono`}
                  />
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        {n.productProblems.length > 0 ? (
          <p className="rounded-xl bg-niki-danger/10 px-4 py-3 text-sm text-niki-danger">
            These stored lines could not be read and are being ignored:{" "}
            {n.productProblems.join(" · ")}
          </p>
        ) : null}
        {n.unmapped.length > 0 ? (
          <p className="rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-700">
            On sale but with no product code, so they stay with the current provider:{" "}
            {n.unmapped.map((s) => `${s}GB`).join(", ")}.
          </p>
        ) : null}

        <SubmitButton>Save {n.label} product codes</SubmitButton>
      </form>
    </section>
  );
}

export function DeveloperSettingsForm({ view }: { view: DeveloperSettingsView }) {
  const [state, formAction] = useActionState<DeveloperSettingsState, FormData>(
    updateDeveloperSettings,
    {},
  );
  const [testState, testAction] = useActionState<DeveloperSettingsState, FormData>(
    testCarrierConnection,
    {},
  );

  const codeNetworks = view.networks.filter((n) => n.carrierId && n.usesProductCodes);

  return (
    <div className="space-y-6">
      {/* The only thing on this page that changes what customers get. */}
      <section className="rounded-2xl bg-white p-6 ring-1 ring-niki-edge">
        <h2 className="font-display text-lg font-bold text-niki-ink">Fulfilment routes</h2>
        <p className="mt-1 text-sm text-niki-ink/60">
          Where each network&apos;s bundle orders are delivered from. A network whose carrier has
          no integration yet always uses the current provider, and says so.
        </p>
        <ul className="mt-4 divide-y divide-niki-edge rounded-xl ring-1 ring-niki-edge">
          {view.networks.map((n) => (
            <RouteRow key={n.network} n={n} formAction={formAction} state={state} />
          ))}
        </ul>
      </section>

      {codeNetworks.map((n) => (
        <ProductCodes key={n.network} n={n} formAction={formAction} />
      ))}

      {view.carriers.map((c) => (
        <section key={c.id} className="rounded-2xl bg-white p-6 ring-1 ring-niki-edge">
          <h2 className="font-display text-lg font-bold text-niki-ink">{c.label}</h2>
          <p className="mt-1 text-sm text-niki-ink/60">
            Credentials and account values live in the deployment&apos;s environment variables,
            not in this console. This panel shows only whether each one is set — the values are
            never sent to a browser. Change them in Vercel → Project → Settings → Environment
            Variables, then redeploy.
          </p>
          <ul className="mt-4 divide-y divide-niki-edge">
            {c.env.map((v) => (
              <EnvRow key={v.name} v={v} />
            ))}
          </ul>

          <div className="mt-5 rounded-xl bg-niki-ink/5 px-4 py-3">
            <p className="text-xs font-semibold text-niki-ink">Callback URL for the portal</p>
            <p className="mt-1 break-all font-mono text-xs text-niki-ink/70">{c.callbackUrl}</p>
            <p className="mt-1 text-xs text-niki-ink/50">
              Paste this into your app&apos;s Callback URL field on the carrier&apos;s developer
              portal. Each order adds its own signed token, so this bare URL is all it needs.
            </p>
          </div>

          {c.hasTest ? (
            <form action={testAction} className="mt-5 space-y-3" noValidate>
              <input type="hidden" name="carrierId" value={c.id} />
              <p className="text-sm text-niki-ink/60">
                Asks {c.label} to authenticate and nothing else. It cannot transfer data, spend a
                line&apos;s balance or touch an order, so it is safe to press at any time — and it
                is the only way to tell a wrong secret from a missing one without reading either.
              </p>
              <FormFeedback
                error={testState.error}
                success={testState.ok ? testState.notice : undefined}
              />
              <SubmitButton>Test {c.label} credentials</SubmitButton>
            </form>
          ) : null}
        </section>
      ))}
    </div>
  );
}
