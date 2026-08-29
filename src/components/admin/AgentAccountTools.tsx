"use client";

import { useActionState, useState } from "react";
import { AlertTriangle, Check, KeyRound, Pencil, Save, Trash2, X } from "lucide-react";
import { Field, inputClass } from "@/components/ui/Field";
import { SubmitButton } from "@/components/ui/motion";
import { CopyChip } from "@/components/agent/AgentCode";
import {
  deleteAgent,
  reissueSetupLink,
  updateAgentDetails,
  type AgentAdminState,
} from "@/lib/data-bundles/agent-admin-actions";
import { cn } from "@/lib/cn";

function Notice({ state }: { state: AgentAdminState }) {
  if (state.error) {
    return (
      <p role="alert" className="animate-fade-up rounded-xl bg-niki-danger/10 px-4 py-3 text-sm font-medium text-niki-danger">
        {state.error}
      </p>
    );
  }
  if (state.ok) {
    return (
      <p role="alert" className="animate-fade-up flex items-center gap-2 rounded-xl bg-niki-success/10 px-4 py-3 text-sm font-medium text-niki-success">
        <Check className="h-4 w-4 shrink-0" />
        {state.message}
      </p>
    );
  }
  return null;
}

/**
 * "This agent has never signed in."
 *
 * The setup link is issued once, at approval, and sent by text and email. If
 * neither is configured — or the text just doesn't arrive — the account exists
 * and nobody can get into it. This is how an admin gets a fresh link to hand
 * over directly.
 */
export function SetupLinkTool({ agentId, name }: { agentId: string; name: string }) {
  const [state, run] = useActionState<AgentAdminState, FormData>(
    async (_p, fd) => reissueSetupLink(fd),
    {},
  );

  return (
    <div className="rounded-2xl bg-amber-50 p-5 ring-1 ring-amber-200">
      <div className="flex items-start gap-3">
        <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-amber-100 text-amber-700">
          <AlertTriangle className="h-4 w-4" />
        </span>
        <div className="min-w-0">
          <p className="font-display font-bold text-amber-900">Hasn&apos;t set a password yet</p>
          <p className="mt-1 text-sm text-amber-800/80">
            {name} can&apos;t sign in until they open their setup link and choose one. Issue a fresh
            link and send it to them directly — on WhatsApp is fine.
          </p>
        </div>
      </div>

      <div className="mt-4 space-y-3">
        <Notice state={state} />

        {state.setupUrl ? (
          <div className="rounded-xl bg-white p-3 ring-1 ring-niki-edge-strong">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-niki-ink/50">
              One-time setup link · valid 7 days
            </p>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <code className="min-w-0 flex-1 truncate rounded-lg bg-niki-surface px-3 py-2 font-mono text-xs text-niki-ink/75">
                {state.setupUrl}
              </code>
              <CopyChip value={state.setupUrl} className="bg-white text-niki-ink/70 ring-1 ring-niki-edge-strong" />
            </div>
          </div>
        ) : null}

        <form action={run}>
          <input type="hidden" name="agentId" value={agentId} />
          <SubmitButton
            pendingLabel="Issuing…"
            icon={<KeyRound className="h-4 w-4" />}
            className="rounded-xl bg-amber-700 px-4 py-2.5 text-sm font-bold text-white hover:bg-amber-800"
          >
            {state.setupUrl ? "Issue another link" : "Issue a setup link"}
          </SubmitButton>
        </form>
      </div>
    </div>
  );
}

/** Edit the store details, and close the storefront for good. */
export function AgentAccountTools({
  agentId,
  initial,
  origin,
}: {
  agentId: string;
  origin: string;
  initial: {
    storeName: string;
    slug: string;
    storeTagline: string;
    storeAbout: string;
    supportPhone: string;
    supportWhatsapp: string;
    whatsappGroup: string;
    storeOpen: boolean;
    status: string;
    afaEnabled: boolean;
    afaPrice: number;
    ownerName: string;
    ownerPhone: string;
    userId: string;
  };
}) {
  const [editing, setEditing] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [editState, save] = useActionState<AgentAdminState, FormData>(updateAgentDetails, {});
  const [delState, remove] = useActionState<AgentAdminState, FormData>(deleteAgent, {});

  return (
    <div className="rounded-2xl bg-white p-5 ring-1 ring-niki-edge-strong">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="font-display font-bold text-niki-ink">Account</h2>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => { setEditing((e) => !e); setConfirming(false); }}
            className="niki-chip niki-focus flex items-center gap-1.5 rounded-full px-4 py-2 text-xs font-bold text-niki-ink/75"
          >
            {editing ? <X className="h-3.5 w-3.5" /> : <Pencil className="h-3.5 w-3.5" />}
            {editing ? "Cancel" : "Edit details"}
          </button>
          <button
            type="button"
            onClick={() => { setConfirming((c) => !c); setEditing(false); }}
            className="niki-press niki-focus flex items-center gap-1.5 rounded-full bg-white px-4 py-2 text-xs font-bold text-niki-danger ring-1 ring-niki-danger/40 hover:bg-niki-danger/5"
          >
            <Trash2 className="h-3.5 w-3.5" />
            Delete
          </button>
        </div>
      </div>

      <div className="mt-4 space-y-3">
        <Notice state={delState.error || delState.ok ? delState : editState} />

        {editing ? (
          <form action={save} className="animate-fade-up space-y-5">
            <input type="hidden" name="agentId" value={agentId} />

            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Store name" htmlFor={`sn-${agentId}`}>
                <input id={`sn-${agentId}`} name="storeName" defaultValue={initial.storeName} required className={inputClass} />
              </Field>
              <Field label="Store link" htmlFor={`sl-${agentId}`} hint={`${origin}/store/…`}>
                <input id={`sl-${agentId}`} name="slug" defaultValue={initial.slug} required className={`${inputClass} font-mono`} />
              </Field>
            </div>

            <Field label="Tagline" htmlFor={`st-${agentId}`} hint="One line under the store name.">
              <input id={`st-${agentId}`} name="storeTagline" defaultValue={initial.storeTagline} className={inputClass} />
            </Field>

            <Field label="About the store" htmlFor={`sa-${agentId}`} hint="Shown to their customers.">
              <textarea id={`sa-${agentId}`} name="storeAbout" rows={3} defaultValue={initial.storeAbout} className={`${inputClass} resize-y`} />
            </Field>

            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Support number" htmlFor={`sp-${agentId}`}>
                <input id={`sp-${agentId}`} name="supportPhone" defaultValue={initial.supportPhone} inputMode="tel" placeholder="0241234567" className={inputClass} />
              </Field>
              <Field label="Support WhatsApp" htmlFor={`sw-${agentId}`}>
                <input id={`sw-${agentId}`} name="supportWhatsapp" defaultValue={initial.supportWhatsapp} inputMode="tel" placeholder="0241234567" className={inputClass} />
              </Field>
            </div>

            <Field label="WhatsApp group link" htmlFor={`wg-${agentId}`} hint="Optional. Must start with https://">
              <input id={`wg-${agentId}`} name="whatsappGroup" defaultValue={initial.whatsappGroup} placeholder="https://chat.whatsapp.com/…" className={inputClass} />
            </Field>

            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Storefront" htmlFor={`so-${agentId}`} hint="Closed hides it from customers.">
                <select id={`so-${agentId}`} name="storeOpen" defaultValue={initial.storeOpen ? "open" : "closed"} className={inputClass}>
                  <option value="open">Open — taking orders</option>
                  <option value="closed">Closed</option>
                </select>
              </Field>
              <Field label="Account status" htmlFor={`ss-${agentId}`} hint="Suspended stops new commission.">
                <select id={`ss-${agentId}`} name="status" defaultValue={initial.status} className={inputClass}>
                  <option value="active">Active</option>
                  <option value="suspended">Suspended</option>
                </select>
              </Field>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="AFA registration" htmlFor={`ae-${agentId}`}>
                <select id={`ae-${agentId}`} name="afaEnabled" defaultValue={initial.afaEnabled ? "on" : "off"} className={inputClass}>
                  <option value="on">Offered on their store</option>
                  <option value="off">Not offered</option>
                </select>
              </Field>
              <Field label="Their AFA price (GH₵)" htmlFor={`ap-${agentId}`} hint="0 uses Nickimart's price.">
                <input id={`ap-${agentId}`} name="afaPrice" type="number" min="0" step="0.01" defaultValue={initial.afaPrice} className={inputClass} />
              </Field>
            </div>

            {/* The person, not the store. Email, role and password stay on
                their user account, where every other account is edited. */}
            <div className="grid gap-4 border-t border-niki-edge pt-4 sm:grid-cols-2">
              <Field label="Owner's name" htmlFor={`on-${agentId}`}>
                <input id={`on-${agentId}`} name="ownerName" defaultValue={initial.ownerName} className={inputClass} />
              </Field>
              <Field label="Owner's phone" htmlFor={`op-${agentId}`}>
                <input id={`op-${agentId}`} name="ownerPhone" defaultValue={initial.ownerPhone} inputMode="tel" placeholder="0241234567" className={inputClass} />
              </Field>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <SubmitButton
                pendingLabel="Saving…"
                icon={<Save className="h-4 w-4" />}
                className="rounded-xl bg-niki-orange px-5 py-2.5 text-sm font-bold text-white hover:bg-niki-orange-light"
              >
                Save details
              </SubmitButton>
              {initial.userId ? (
                <a
                  href={`/admin/users/${initial.userId}`}
                  className="niki-focus text-sm font-semibold text-niki-ink/60 underline underline-offset-2 hover:text-niki-orange"
                >
                  Email, role &amp; password →
                </a>
              ) : null}
            </div>
          </form>
        ) : null}

        {confirming ? (
          <form action={remove} className="animate-fade-up rounded-xl bg-niki-danger/5 p-4 ring-1 ring-niki-danger/30">
            <input type="hidden" name="agentId" value={agentId} />
            <p className="text-sm font-semibold text-niki-ink">
              Remove {initial.storeName}&apos;s storefront?
            </p>
            <p className="mt-1 text-sm text-niki-ink/65">
              Their store link stops working and their prices, ledger and withdrawal history go with
              it. Orders they sold stay in the records. They keep their Nickimart account and can
              still shop — being an agent is something an account has, not what it is.
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              <SubmitButton
                pendingLabel="Removing…"
                icon={<Trash2 className="h-3.5 w-3.5" />}
                className="rounded-full bg-niki-danger px-4 py-2 text-xs font-bold text-white hover:bg-red-700"
              >
                Yes, remove the storefront
              </SubmitButton>
              <button
                type="button"
                onClick={() => setConfirming(false)}
                className={cn("niki-chip niki-focus rounded-full px-4 py-2 text-xs font-bold text-niki-ink/75")}
              >
                Keep it
              </button>
            </div>
          </form>
        ) : null}
      </div>
    </div>
  );
}
