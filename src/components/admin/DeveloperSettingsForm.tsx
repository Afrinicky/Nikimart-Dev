"use client";

import { useActionState } from "react";
import { Field, inputClass } from "@/components/ui/Field";
import { SubmitButton } from "@/components/auth/SubmitButton";
import { FormFeedback } from "@/components/ui/FormFeedback";
import {
  testMtnConnection,
  updateDeveloperSettings,
  type DeveloperSettingsState,
} from "@/lib/data-bundles/developer-actions";

/**
 * The Developer tab: every API credential and routing switch in one place.
 *
 * Two deliberate properties, both about running this on a live store:
 *
 *   Nothing here is live until the route select says so. Every other field can
 *   be filled in, saved and re-saved while MTN orders carry on going exactly
 *   where they have always gone. That is what makes it safe to configure this
 *   during trading hours.
 *
 *   Secrets are write-only. The consumer secret and the PIN are never rendered
 *   back — the inputs are always empty, and leaving one empty keeps whatever
 *   is stored. Removing one needs its own checkbox, because "I did not retype
 *   it" and "I want it gone" must not look the same to the server.
 */

export interface DeveloperSettingsView {
  route: string;
  routeReady: boolean;
  missing: string[];
  /** Whether each secret is stored — never the secret itself. */
  hasClientSecret: boolean;
  hasPin: boolean;
  values: {
    mtnApiBase: string;
    mtnClientId: string;
    mtnSenderMsisdn: string;
    mtnTargetSystem: string;
    mtnOriginChannelId: string;
    mtnCountryCode: string;
    mtnNetworkParam: string;
    mtnTransferType: string;
    mtnMsisdnFormat: string;
    mtnAgentId: string;
    mtnCallbackEnabled: string;
    mtnProductCodes: string;
  };
  /** Lines of the product list that could not be read. */
  productProblems: string[];
  /** Active MTN bundle sizes with no product code yet. */
  unmapped: number[];
  mappedCount: number;
  /** The URL to register as the app's Callback URL on the MTN portal. */
  callbackUrl: string;
}

function SecretField({
  name,
  label,
  hint,
  stored,
}: {
  name: string;
  label: string;
  hint: string;
  stored: boolean;
}) {
  return (
    <div>
      <Field
        label={label}
        htmlFor={name}
        hint={stored ? `${hint} — a value is stored; leave empty to keep it.` : hint}
      >
        <input
          id={name}
          name={name}
          type="password"
          autoComplete="new-password"
          placeholder={stored ? "••••••••  (unchanged)" : "Not set"}
          className={inputClass}
        />
      </Field>
      {stored ? (
        <label className="mt-2 flex items-center gap-2 text-xs text-niki-ink/60">
          <input type="checkbox" name={`${name}Clear`} className="h-3.5 w-3.5 rounded" />
          Remove the stored value
        </label>
      ) : null}
    </div>
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

  return (
    <div className="space-y-6">
      {/* The one thing on this page that changes what customers get. */}
      <section
        className={`rounded-2xl p-6 ring-1 ${
          live
            ? "bg-niki-success/5 ring-niki-success/30"
            : "bg-white ring-niki-edge"
        }`}
      >
        <h2 className="font-display text-lg font-bold text-niki-ink">Fulfilment route</h2>
        <p className="mt-1 text-sm text-niki-ink/60">
          Where MTN bundle orders are actually delivered from. Telecel and AirtelTigo always use
          the current provider — MTN&apos;s transfer API can only credit an MTN subscriber.
        </p>

        <div className="mt-4 rounded-xl bg-niki-ink/5 px-4 py-3 text-sm">
          <span className="font-semibold text-niki-ink">
            {live ? "MTN orders are being transferred from your MTN line." : "MTN orders use the current provider."}
          </span>
          {!live && view.missing.length === 0 && view.mappedCount > 0 ? (
            <span className="block text-niki-ink/60">Ready to switch over whenever you are.</span>
          ) : null}
          {view.missing.length > 0 ? (
            <span className="block text-niki-ink/60">
              Still needed: {view.missing.join(", ")}.
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
          <FormFeedback error={state.error} success={state.ok ? (state.notice ?? "Saved.") : undefined} />
          <SubmitButton>Save route</SubmitButton>
        </form>
      </section>

      {/* Everything below is inert until the switch above says otherwise. */}
      <form action={formAction} className="space-y-6" noValidate>
        <section className="rounded-2xl bg-white p-6 ring-1 ring-niki-edge">
          <h2 className="font-display text-lg font-bold text-niki-ink">MTN API credentials</h2>
          <p className="mt-1 text-sm text-niki-ink/60">
            From your app on{" "}
            <a
              href="https://developers.mtn.com/apps"
              target="_blank"
              rel="noreferrer"
              className="font-medium text-niki-orange hover:underline"
            >
              developers.mtn.com
            </a>{" "}
            — the Consumer key and Consumer secret of the app subscribed to MTN Customer Data
            Transfer.
          </p>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <Field label="API base URL" htmlFor="mtnApiBase" hint="Only change this if MTN moves the API">
              <input
                id="mtnApiBase"
                name="mtnApiBase"
                type="url"
                defaultValue={view.values.mtnApiBase}
                placeholder="https://api.mtn.com/v1"
                className={inputClass}
              />
            </Field>
            <Field label="Consumer key" htmlFor="mtnClientId">
              <input
                id="mtnClientId"
                name="mtnClientId"
                defaultValue={view.values.mtnClientId}
                autoComplete="off"
                className={inputClass}
              />
            </Field>
          </div>
          <div className="mt-4">
            <SecretField
              name="mtnClientSecret"
              label="Consumer secret"
              hint="Never shown again once saved"
              stored={view.hasClientSecret}
            />
          </div>
        </section>

        <section className="rounded-2xl bg-white p-6 ring-1 ring-niki-edge">
          <h2 className="font-display text-lg font-bold text-niki-ink">The sending line</h2>
          <p className="mt-1 text-sm text-niki-ink/60">
            A transfer moves data <em>out of</em> an MTN line you own. This is that line — keep it
            loaded, because an empty line fails orders customers have already paid for.
          </p>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <Field label="Sender number" htmlFor="mtnSenderMsisdn" hint="e.g. 0240719356">
              <input
                id="mtnSenderMsisdn"
                name="mtnSenderMsisdn"
                defaultValue={view.values.mtnSenderMsisdn}
                placeholder="024…"
                className={inputClass}
              />
            </Field>
            <SecretField
              name="mtnSenderPin"
              label="Line PIN"
              hint="Only if your account requires one — leave empty if not"
              stored={view.hasPin}
            />
          </div>
        </section>

        <section className="rounded-2xl bg-white p-6 ring-1 ring-niki-edge">
          <h2 className="font-display text-lg font-bold text-niki-ink">Account values</h2>
          <p className="mt-1 text-sm text-niki-ink/60">
            Issued by MTN for your account. There is nothing sensible to guess here, so a transfer
            will not be attempted until the target system is set.
          </p>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <Field label="Target system" htmlFor="mtnTargetSystem" hint="Required by the transfer request">
              <input
                id="mtnTargetSystem"
                name="mtnTargetSystem"
                defaultValue={view.values.mtnTargetSystem}
                className={inputClass}
              />
            </Field>
            <Field label="Origin channel ID" htmlFor="mtnOriginChannelId" hint="Sent as x-origin-channelid">
              <input
                id="mtnOriginChannelId"
                name="mtnOriginChannelId"
                defaultValue={view.values.mtnOriginChannelId}
                className={inputClass}
              />
            </Field>
            <Field label="Country code" htmlFor="mtnCountryCode" hint="Sent as x-country-code">
              <input
                id="mtnCountryCode"
                name="mtnCountryCode"
                defaultValue={view.values.mtnCountryCode}
                placeholder="GH"
                className={inputClass}
              />
            </Field>
            <Field label="Network parameter" htmlFor="mtnNetworkParam" hint="Only if your account expects one — leave empty otherwise">
              <input
                id="mtnNetworkParam"
                name="mtnNetworkParam"
                defaultValue={view.values.mtnNetworkParam}
                className={inputClass}
              />
            </Field>
            <Field label="Transfer type" htmlFor="mtnTransferType" hint="DATA for bundles">
              <input
                id="mtnTransferType"
                name="mtnTransferType"
                defaultValue={view.values.mtnTransferType}
                placeholder="DATA"
                className={inputClass}
              />
            </Field>
            <Field label="Number format" htmlFor="mtnMsisdnFormat" hint="How your account writes a subscriber number">
              <select
                id="mtnMsisdnFormat"
                name="mtnMsisdnFormat"
                defaultValue={view.values.mtnMsisdnFormat === "LOCAL" ? "LOCAL" : "INTERNATIONAL"}
                className={inputClass}
              >
                <option value="INTERNATIONAL">International — 233240719356</option>
                <option value="LOCAL">Local — 0240719356</option>
              </select>
            </Field>
            <Field label="Agent ID" htmlFor="mtnAgentId" hint="Optional, where transfers are attributed to an agent">
              <input
                id="mtnAgentId"
                name="mtnAgentId"
                defaultValue={view.values.mtnAgentId}
                className={inputClass}
              />
            </Field>
            <Field
              label="Status callbacks"
              htmlFor="mtnCallbackEnabled"
              hint="Off means we only learn a transfer's outcome by asking"
            >
              <select
                id="mtnCallbackEnabled"
                name="mtnCallbackEnabled"
                defaultValue={view.values.mtnCallbackEnabled === "0" ? "0" : "1"}
                className={inputClass}
              >
                <option value="1">On — MTN calls us back</option>
                <option value="0">Off — we poll for status</option>
              </select>
            </Field>
          </div>

          <div className="mt-5 rounded-xl bg-niki-ink/5 px-4 py-3">
            <p className="text-xs font-semibold text-niki-ink">
              Callback URL for the MTN portal
            </p>
            <p className="mt-1 break-all font-mono text-xs text-niki-ink/70">{view.callbackUrl}</p>
            <p className="mt-1 text-xs text-niki-ink/50">
              Paste this into your app&apos;s Callback URL field on developers.mtn.com. Each order
              adds its own signed token, so this bare URL is all the portal needs.
            </p>
          </div>
        </section>

        <section className="rounded-2xl bg-white p-6 ring-1 ring-niki-edge">
          <h2 className="font-display text-lg font-bold text-niki-ink">Product codes</h2>
          <p className="mt-1 text-sm text-niki-ink/60">
            Which MTN product each bundle size corresponds to — one per line, as
            <code className="mx-1 font-mono text-xs">size = CODE</code>. A size with no code here
            is sent to the current provider instead, never guessed at.
          </p>
          <div className="mt-4">
            <Field label="Size to product code" htmlFor="mtnProductCodes" hint="e.g. 5 = MTN_DATA_5GB">
              <textarea
                id="mtnProductCodes"
                name="mtnProductCodes"
                rows={8}
                defaultValue={view.values.mtnProductCodes}
                placeholder={"1 = MTN_DATA_1GB\n5 = MTN_DATA_5GB\n10 = MTN_DATA_10GB"}
                className={`${inputClass} font-mono`}
              />
            </Field>
          </div>

          {view.productProblems.length > 0 ? (
            <p className="mt-3 rounded-xl bg-niki-danger/10 px-4 py-3 text-sm text-niki-danger">
              These lines could not be read and are being ignored:{" "}
              {view.productProblems.join(" · ")}
            </p>
          ) : null}
          {view.unmapped.length > 0 ? (
            <p className="mt-3 rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-700">
              On sale but with no product code, so they stay with the current provider:{" "}
              {view.unmapped.map((s) => `${s}GB`).join(", ")}.
            </p>
          ) : null}
        </section>

        <FormFeedback error={state.error} success={state.ok ? (state.notice ?? "Saved.") : undefined} />
        <SubmitButton>Save developer settings</SubmitButton>
      </form>

      <section className="rounded-2xl bg-white p-6 ring-1 ring-niki-edge">
        <h2 className="font-display text-lg font-bold text-niki-ink">Test the connection</h2>
        <p className="mt-1 text-sm text-niki-ink/60">
          Asks MTN for an access token and nothing else. It cannot transfer data, spend the
          line&apos;s balance or touch an order, so it is safe to press at any time.
        </p>
        <form action={testAction} className="mt-4 space-y-3" noValidate>
          <FormFeedback
            error={testState.error}
            success={testState.ok ? (testState.notice ?? "MTN accepted the credentials.") : undefined}
          />
          <SubmitButton>Test MTN credentials</SubmitButton>
        </form>
      </section>
    </div>
  );
}
