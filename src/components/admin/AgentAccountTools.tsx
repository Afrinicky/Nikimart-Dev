"use client";

import { useActionState, useState } from "react";
import { AlertTriangle, Check, KeyRound, Pencil, Save, Trash2, X } from "lucide-react";
import { Field, inputClass } from "@/components/ui/Field";
import { SubmitButton } from "@/components/ui/motion";
import { CopyChip } from "@/components/agent/AgentCode";
import {
  clearAgentTwoFactor,
  deleteAgent,
  reissueSetupLink,
  unlockAgentAccount,
  updateAgentAccount,
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
    /** The sign-in account behind the storefront, in this database. */
    account?: {
      email: string;
      phone: string;
      twoFactorEnabled: boolean;
      /** 0 none · 1 a minute · 2 half an hour · 3 held for an admin. */
      lockoutStage: number;
      /**
       * Whether a timed lock was still running when the page was built.
       * Decided on the server: reading the clock during render is impure, and
       * a lock that lifts while somebody reads the screen is not worth it.
       */
      lockedNow: boolean;
    };
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
            className="niki-chip niki-focus flex items-center gap-1.5 rounded-lg px-4 py-2 text-xs font-bold text-niki-ink/75"
          >
            {editing ? <X className="h-3.5 w-3.5" /> : <Pencil className="h-3.5 w-3.5" />}
            {editing ? "Cancel" : "Edit details"}
          </button>
          <button
            type="button"
            onClick={() => { setConfirming((c) => !c); setEditing(false); }}
            className="niki-press niki-focus flex items-center gap-1.5 rounded-lg bg-white px-4 py-2 text-xs font-bold text-niki-danger ring-1 ring-niki-danger/40 hover:bg-niki-danger/5"
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

            </div>
          </form>
        ) : null}

        {initial.userId && initial.account ? (
          <AgentSignInAccount agentId={agentId} userId={initial.userId} account={initial.account} />
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
                className="rounded-lg bg-niki-danger px-4 py-2 text-xs font-bold text-white hover:bg-red-700"
              >
                Yes, remove the storefront
              </SubmitButton>
              <button
                type="button"
                onClick={() => setConfirming(false)}
                className={cn("niki-chip niki-focus rounded-lg px-4 py-2 text-xs font-bold text-niki-ink/75")}
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

/**
 * The sign-in account behind a storefront.
 *
 * Everything an administrator used to leave this console for: the address they
 * sign in with, a new password, and the two switches that get somebody back in
 * when the system has shut them out — the escalating sign-in lock, and a
 * second step going to a phone they no longer have.
 *
 * All of it writes `DataUser`, in the bundle database. The link this replaces
 * went to the mall's user editor, which since the split is a different table
 * in a different database: a password set there was a password the agent
 * console never read, and nothing said so.
 */
function AgentSignInAccount({
  agentId,
  userId,
  account,
}: {
  agentId: string;
  userId: string;
  account: {
    email: string;
    phone: string;
    twoFactorEnabled: boolean;
    lockoutStage: number;
    lockedNow: boolean;
  };
}) {
  const [open, setOpen] = useState(false);
  const [state, save] = useActionState<AgentAdminState, FormData>(updateAgentAccount, {});

  const held = account.lockoutStage >= 3;
  const locked = held || account.lockedNow;

  return (
    <div className="mt-4 border-t border-niki-edge pt-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <KeyRound className="h-4 w-4 text-niki-ink/45" />
          <p className="text-sm font-semibold text-niki-ink">Sign-in account</p>
        </div>
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="niki-focus text-sm font-semibold text-niki-orange hover:underline"
        >
          {open ? "Close" : "Manage"}
        </button>
      </div>

      {locked ? (
        <form action={unlockAgentAccount} className="mt-3 rounded-xl bg-niki-danger/5 p-4 ring-1 ring-niki-danger/25">
          <input type="hidden" name="agentId" value={agentId} />
          <p className="text-sm text-niki-ink/80">
            <span className="font-semibold text-niki-ink">
              {held ? "Locked out." : "Temporarily locked."}
            </span>{" "}
            {held
              ? "Too many failed sign-ins. Waiting will not clear this one — unlock it, or set a new password below."
              : "Too many failed sign-ins. It lifts on its own shortly, or you can lift it now."}
          </p>
          <SubmitButton
            pendingLabel="Unlocking…"
            className="mt-3 rounded-lg bg-niki-ink px-4 py-2 text-xs font-bold text-white hover:bg-niki-black"
          >
            Unlock this account
          </SubmitButton>
        </form>
      ) : null}

      {open ? (
        <form action={save} className="animate-fade-up mt-3 space-y-4">
          <input type="hidden" name="userId" value={userId} />
          <Notice state={state} />

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Email they sign in with" htmlFor={`ae-${agentId}`}>
              <input
                id={`ae-${agentId}`}
                name="email"
                type="email"
                defaultValue={account.email}
                className={inputClass}
              />
            </Field>
            <Field label="Phone they sign in with" htmlFor={`ap-${agentId}`}>
              <input
                id={`ap-${agentId}`}
                name="phone"
                inputMode="tel"
                defaultValue={account.phone}
                placeholder="0241234567"
                className={inputClass}
              />
            </Field>
          </div>

          <Field
            label="New password"
            htmlFor={`aw-${agentId}`}
            hint="Leave blank to keep the current one. Setting one signs them out everywhere and lifts any lock."
          >
            <input
              id={`aw-${agentId}`}
              name="password"
              type="password"
              autoComplete="new-password"
              placeholder="••••••••"
              className={inputClass}
            />
          </Field>

          <SubmitButton
            pendingLabel="Saving…"
            icon={<Save className="h-4 w-4" />}
            className="rounded-xl bg-niki-orange px-5 py-2.5 text-sm font-bold text-white hover:bg-niki-orange-light"
          >
            Save account
          </SubmitButton>
        </form>
      ) : null}

      {open && account.twoFactorEnabled ? (
        <form action={clearAgentTwoFactor} className="mt-3 rounded-xl bg-niki-surface p-4">
          <input type="hidden" name="userId" value={userId} />
          <p className="text-sm text-niki-ink/75">
            <span className="font-semibold text-niki-ink">Two-step verification is on.</span> If
            they have lost the phone or inbox the codes go to, switching it off is the way back in.
          </p>
          <SubmitButton
            pendingLabel="Switching off…"
            className="mt-3 rounded-lg bg-white px-4 py-2 text-xs font-bold text-niki-ink ring-1 ring-niki-edge-strong hover:bg-niki-black/5"
          >
            Switch off two-step verification
          </SubmitButton>
        </form>
      ) : null}
    </div>
  );
}
