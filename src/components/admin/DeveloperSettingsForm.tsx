"use client";

import { useActionState } from "react";
import Link from "next/link";
import { Check, Minus } from "lucide-react";
import { Field, inputClass } from "@/components/ui/Field";
import { SubmitButton } from "@/components/auth/SubmitButton";
import { FormFeedback } from "@/components/ui/FormFeedback";
import {
  testMtnConnection,
  updateDeveloperSettings,
  type DeveloperSettingsState,
} from "@/lib/data-bundles/developer-actions";
import {
  CODE_FIELD_PREFIX,
  PRODUCT_CODES_SUBMITTED,
} from "@/lib/data-bundles/mtn/products";

/**
 * The Developer tab: the fulfilment route, the product codes, and a read-only
 * view of what the environment is holding.
 *
 * Credentials are not editable here and never arrive here. The server sends
 * only whether each variable is set — never a value, not even a masked one —
 * so there is nothing on this page for a shared screen, a browser extension or
 * a support session to pick up. Changing one is a Vercel edit and a redeploy.
 *
 * What stays editable is what must be changeable now: the switch, because
 * turning the route off is how you stop it, and the product codes, because a
 * new bundle size needs a line against it the same afternoon.
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

export interface DeveloperSettingsView {
  route: string;
  routeReady: boolean;
  /** Names of environment variables still needed. Never values. */
  missing: string[];
  env: EnvVarView[];
  /** One row per MTN bundle in the price ladder, smallest first. */
  ladder: ProductRowView[];
  /** Codes whose bundle is no longer in the ladder. */
  orphans: ProductRowView[];
  /** Lines of the stored list that could not be read. */
  productProblems: string[];
  /** Active MTN bundle sizes with no product code yet. */
  unmapped: number[];
  mappedCount: number;
  /** The URL to register as the app's Callback URL on the MTN portal. */
  callbackUrl: string;
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

export function DeveloperSettingsForm({ view }: { view: DeveloperSettingsView }) {
  const [state, formAction] = useActionState<DeveloperSettingsState, FormData>(
    updateDeveloperSettings,
    {},
  );
  const [testState, testAction] = useActionState<DeveloperSettingsState, FormData>(
    testMtnConnection,
    {},
  );

  const live = view.route === "MTN";
  const envReady = view.missing.length === 0;

  return (
    <div className="space-y-6">
      {/* The one thing on this page that changes what customers get. */}
      <section
        className={`rounded-2xl p-6 ring-1 ${
          live ? "bg-niki-success/5 ring-niki-success/30" : "bg-white ring-niki-edge"
        }`}
      >
        <h2 className="font-display text-lg font-bold text-niki-ink">Fulfilment route</h2>
        <p className="mt-1 text-sm text-niki-ink/60">
          Where MTN bundle orders are actually delivered from. Telecel and AirtelTigo always use
          the current provider — MTN&apos;s transfer API can only credit an MTN subscriber.
        </p>

        <div className="mt-4 rounded-xl bg-niki-ink/5 px-4 py-3 text-sm">
          <span className="font-semibold text-niki-ink">
            {live
              ? "MTN orders are being transferred from your MTN line."
              : "MTN orders use the current provider."}
          </span>
          {!live && envReady && view.mappedCount > 0 ? (
            <span className="block text-niki-ink/60">Ready to switch over whenever you are.</span>
          ) : null}
          {view.missing.length > 0 ? (
            <span className="block text-niki-ink/60">
              Not set in the environment: {view.missing.join(", ")}.
            </span>
          ) : null}
        </div>

        <form action={formAction} className="mt-4 space-y-4" noValidate>
          <Field
            label="MTN bundles are delivered by"
            htmlFor="dataRouteMTN"
            hint="Changing this takes effect on the next order. Orders already placed stay with the provider holding them."
          >
            <select
              id="dataRouteMTN"
              name="dataRouteMTN"
              defaultValue={live ? "MTN" : "JUSTICE"}
              className={inputClass}
            >
              <option value="JUSTICE">The current provider — no change</option>
              <option value="MTN">MTN Customer Data Transfer</option>
            </select>
          </Field>
          <FormFeedback
            error={state.error}
            success={state.ok ? (state.notice ?? "Saved.") : undefined}
          />
          <SubmitButton>Save route</SubmitButton>
        </form>
      </section>

      <section className="rounded-2xl bg-white p-6 ring-1 ring-niki-edge">
        <h2 className="font-display text-lg font-bold text-niki-ink">Product codes</h2>
        <p className="mt-1 text-sm text-niki-ink/60">
          Which MTN product each bundle corresponds to. The rows come straight from the price
          ladder, so adding a bundle on the{" "}
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
          <input type="hidden" name={PRODUCT_CODES_SUBMITTED} value="1" />

          {view.ladder.length === 0 ? (
            <p className="rounded-xl bg-niki-ink/5 px-4 py-6 text-center text-sm text-niki-ink/60">
              No MTN bundles in the price ladder yet. Add one on the Bundle prices tab and it
              will appear here.
            </p>
          ) : (
            <ul className="divide-y divide-niki-edge rounded-xl ring-1 ring-niki-edge">
              {view.ladder.map((row) => (
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
                    name={`${CODE_FIELD_PREFIX}${row.sizeGb}`}
                    defaultValue={row.code}
                    placeholder="MTN product code"
                    aria-label={`MTN product code for the ${row.sizeGb}GB bundle`}
                    autoComplete="off"
                    className={`${inputClass} font-mono`}
                  />
                </li>
              ))}
            </ul>
          )}

          {view.orphans.length > 0 ? (
            <div className="rounded-xl bg-niki-ink/5 p-3">
              <p className="text-xs font-semibold text-niki-ink">No longer in the price ladder</p>
              <p className="mt-0.5 text-xs text-niki-ink/55">
                These bundles have been removed or resized. Their codes are kept in case the size
                comes back — clear a field to drop it for good.
              </p>
              <ul className="mt-2 space-y-2">
                {view.orphans.map((row) => (
                  <li key={row.sizeGb} className="flex items-center gap-3">
                    <span className="w-24 shrink-0 text-sm font-medium text-niki-ink/60">
                      {row.sizeGb}GB
                    </span>
                    <input
                      name={`${CODE_FIELD_PREFIX}${row.sizeGb}`}
                      defaultValue={row.code}
                      aria-label={`MTN product code kept for ${row.sizeGb}GB`}
                      autoComplete="off"
                      className={`${inputClass} font-mono`}
                    />
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          {view.productProblems.length > 0 ? (
            <p className="rounded-xl bg-niki-danger/10 px-4 py-3 text-sm text-niki-danger">
              These stored lines could not be read and are being ignored:{" "}
              {view.productProblems.join(" \u00b7 ")}
            </p>
          ) : null}
          {view.unmapped.length > 0 ? (
            <p className="rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-700">
              On sale but with no product code, so they stay with the current provider:{" "}
              {view.unmapped.map((s) => `${s}GB`).join(", ")}.
            </p>
          ) : null}

          <SubmitButton>Save product codes</SubmitButton>
        </form>
      </section>

      <section className="rounded-2xl bg-white p-6 ring-1 ring-niki-edge">
        <h2 className="font-display text-lg font-bold text-niki-ink">Environment</h2>
        <p className="mt-1 text-sm text-niki-ink/60">
          Credentials and the account values MTN issues live in the deployment&apos;s environment
          variables, not in this console. This panel shows only whether each one is set — the
          values are never sent to a browser. Change them in Vercel → Project → Settings →
          Environment Variables, then redeploy.
        </p>
        <ul className="mt-4 divide-y divide-niki-edge">
          {view.env.map((v) => (
            <EnvRow key={v.name} v={v} />
          ))}
        </ul>

        <div className="mt-5 rounded-xl bg-niki-ink/5 px-4 py-3">
          <p className="text-xs font-semibold text-niki-ink">Callback URL for the MTN portal</p>
          <p className="mt-1 break-all font-mono text-xs text-niki-ink/70">{view.callbackUrl}</p>
          <p className="mt-1 text-xs text-niki-ink/50">
            Paste this into your app&apos;s Callback URL field on developers.mtn.com. Each order
            adds its own signed token, so this bare URL is all the portal needs.
          </p>
        </div>
      </section>

      <section className="rounded-2xl bg-white p-6 ring-1 ring-niki-edge">
        <h2 className="font-display text-lg font-bold text-niki-ink">Test the connection</h2>
        <p className="mt-1 text-sm text-niki-ink/60">
          Asks MTN for an access token and nothing else. It cannot transfer data, spend the
          line&apos;s balance or touch an order, so it is safe to press at any time — and it is
          the only way to tell a wrong secret from a missing one without reading either.
        </p>
        <form action={testAction} className="mt-4 space-y-3" noValidate>
          <FormFeedback
            error={testState.error}
            success={
              testState.ok ? (testState.notice ?? "MTN accepted the credentials.") : undefined
            }
          />
          <SubmitButton>Test MTN credentials</SubmitButton>
        </form>
      </section>
    </div>
  );
}
