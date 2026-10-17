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
 * One carrier's setup page.
 *
 * Per carrier rather than per console, because setting up MTN has nothing to
 * do with setting up Telecel: different credentials, different portal,
 * different person waiting on a reply. Each tab is a self-contained job.
 *
 * Within a carrier, the unit is still the network. AirtelTigo sells two
 * ladders through one account, so its page carries two route switches and two
 * product-code lists against one set of credentials — which lets one ladder be
 * moved over and watched while the other stays where it is.
 *
 * Credentials are not editable here and never arrive here. The server sends
 * only whether each variable is set — never a value, not even a masked one —
 * so there is nothing on this page for a shared screen, a browser extension or
 * a support session to pick up. Changing one is a Vercel edit and a redeploy.
 */

export interface EnvVarView {
  name: string;
  label: string;
  required: boolean;
  set: boolean;
  fallback?: string;
  /** The value's length, and anything suspicious about it. Never the value. */
  shape?: string;
}

export interface ProductRowView {
  sizeGb: number;
  code: string;
  isActive: boolean;
}

export interface CarrierNetworkView {
  network: Network;
  label: string;
  /** Whether this network is currently routed to this carrier. */
  live: boolean;
  /** One row per bundle in this network's ladder, smallest first. */
  ladder: ProductRowView[];
  /** Codes whose bundle is no longer in the ladder. */
  orphans: ProductRowView[];
  productProblems: string[];
  /** Sizes on sale with no code yet. */
  unmapped: number[];
  mappedCount: number;
}

export interface CarrierSettingsView {
  id: string;
  label: string;
  productLabel: string;
  ready: boolean;
  /** Environment variables still needed. Never values. */
  missing: string[];
  usesProductCodes: boolean;
  env: EnvVarView[];
  hasTest: boolean;
  callbackUrl: string;
  networks: CarrierNetworkView[];
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
        {v.shape ? (
          <span
            className={`mt-0.5 block text-xs ${
              /quotes|space|line break/.test(v.shape)
                ? "font-medium text-niki-danger"
                : "text-niki-ink/40"
            }`}
          >
            {v.shape}
          </span>
        ) : null}
      </span>
    </li>
  );
}

export function CarrierSettingsForm({ view }: { view: CarrierSettingsView }) {
  const [state, formAction] = useActionState<DeveloperSettingsState, FormData>(
    updateDeveloperSettings,
    {},
  );
  const [testState, testAction] = useActionState<DeveloperSettingsState, FormData>(
    testCarrierConnection,
    {},
  );

  return (
    <div className="space-y-6">
      {/* The only thing on this page that changes what customers get. */}
      <section className="rounded-2xl bg-white p-6 ring-1 ring-niki-edge">
        <h2 className="font-display text-lg font-bold text-niki-ink">Fulfilment</h2>
        <p className="mt-1 text-sm text-niki-ink/60">
          Where each {view.label} ladder&apos;s orders are delivered from. Changing this takes
          effect on the next order; orders already placed stay with the provider holding them.
        </p>
        {view.missing.length > 0 ? (
          <p className="mt-3 rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-700">
            {view.productLabel} cannot take orders until these are set in the environment:{" "}
            <span className="font-mono text-xs">{view.missing.join(", ")}</span>.
          </p>
        ) : null}

        <ul className="mt-4 divide-y divide-niki-edge rounded-xl ring-1 ring-niki-edge">
          {view.networks.map((n) => (
            <li key={n.network} className={`p-4 ${n.live ? "bg-niki-success/5" : ""}`}>
              <form action={formAction} className="space-y-3" noValidate>
                <div className="flex flex-wrap items-end gap-3">
                  <span className="min-w-[8rem] flex-1">
                    <span className="block font-display text-sm font-bold text-niki-ink">
                      {n.label}
                    </span>
                    <span className="block text-xs text-niki-ink/55">
                      {n.live
                        ? `Delivered by ${view.productLabel}.`
                        : "Delivered by the current provider."}
                    </span>
                  </span>
                  <span className="w-full sm:w-72">
                    <Field label="" htmlFor={`dataRoute${n.network}`}>
                      <select
                        id={`dataRoute${n.network}`}
                        name={`dataRoute${n.network}`}
                        defaultValue={n.live ? view.id : "JUSTICE"}
                        aria-label={`How ${n.label} bundles are delivered`}
                        className={inputClass}
                      >
                        <option value="JUSTICE">The current provider — no change</option>
                        <option value={view.id}>{view.productLabel}</option>
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
          ))}
        </ul>
      </section>

      {view.usesProductCodes
        ? view.networks.map((n) => (
            <section key={n.network} className="rounded-2xl bg-white p-6 ring-1 ring-niki-edge">
              <h2 className="font-display text-lg font-bold text-niki-ink">
                {n.label} product codes
              </h2>
              <p className="mt-1 text-sm text-niki-ink/60">
                Which {view.productLabel} product each bundle corresponds to. The rows come
                straight from the price ladder, so adding a bundle on the{" "}
                <Link
                  href="/admin/data/bundles"
                  className="font-medium text-niki-orange hover:underline"
                >
                  Bundle prices
                </Link>{" "}
                tab puts it here automatically. A size left blank is sent to the current provider
                instead, never guessed at.
              </p>

              <form action={formAction} className="mt-4 space-y-4" noValidate>
                <input type="hidden" name={productCodesSubmittedField(n.network)} value="1" />

                {n.ladder.length === 0 ? (
                  <p className="rounded-xl bg-niki-ink/5 px-4 py-6 text-center text-sm text-niki-ink/60">
                    No {n.label} bundles in the price ladder yet. Add one on the Bundle prices tab
                    and it will appear here.
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
                            <span className="text-[11px] font-medium text-niki-ink/45">
                              not on sale
                            </span>
                          )}
                        </span>
                        <input
                          name={codeFieldName(n.network, row.sizeGb)}
                          defaultValue={row.code}
                          placeholder={`${view.productLabel} product code`}
                          aria-label={`${view.productLabel} product code for the ${row.sizeGb}GB bundle`}
                          autoComplete="off"
                          className={`${inputClass} font-mono`}
                        />
                      </li>
                    ))}
                  </ul>
                )}

                {n.orphans.length > 0 ? (
                  <div className="rounded-xl bg-niki-ink/5 p-3">
                    <p className="text-xs font-semibold text-niki-ink">
                      No longer in the price ladder
                    </p>
                    <p className="mt-0.5 text-xs text-niki-ink/55">
                      These bundles have been removed or resized. Their codes are kept in case the
                      size comes back — clear a field to drop it for good.
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
          ))
        : null}

      <section className="rounded-2xl bg-white p-6 ring-1 ring-niki-edge">
        <h2 className="font-display text-lg font-bold text-niki-ink">Environment</h2>
        <p className="mt-1 text-sm text-niki-ink/60">
          Credentials and the account values {view.label} issues live in the deployment&apos;s
          environment variables, not in this console. This panel shows only whether each one is
          set — the values are never sent to a browser. Change them in Vercel → Project → Settings
          → Environment Variables, then redeploy.
        </p>
        <ul className="mt-4 divide-y divide-niki-edge">
          {view.env.map((v) => (
            <EnvRow key={v.name} v={v} />
          ))}
        </ul>

        <div className="mt-5 rounded-xl bg-niki-ink/5 px-4 py-3">
          <p className="text-xs font-semibold text-niki-ink">Callback URL for the portal</p>
          <p className="mt-1 break-all font-mono text-xs text-niki-ink/70">{view.callbackUrl}</p>
          <p className="mt-1 text-xs text-niki-ink/50">
            Paste this into your app&apos;s Callback URL field on {view.label}&apos;s developer
            portal. Each order adds its own signed token, so this bare URL is all it needs.
          </p>
        </div>

        {view.hasTest ? (
          <form action={testAction} className="mt-5 space-y-3" noValidate>
            <input type="hidden" name="carrierId" value={view.id} />
            <p className="text-sm text-niki-ink/60">
              Asks {view.label} to authenticate and nothing else. It cannot transfer data, spend a
              line&apos;s balance or touch an order, so it is safe to press at any time — and it is
              the only way to tell a wrong secret from a missing one without reading either.
            </p>
            <FormFeedback
              error={testState.error}
              success={testState.ok ? testState.notice : undefined}
            />
            <SubmitButton>Test {view.label} credentials</SubmitButton>
          </form>
        ) : null}
      </section>
    </div>
  );
}
