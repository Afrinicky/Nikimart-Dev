"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Check, KeyRound, Save, UserRound } from "lucide-react";
import { inputClass } from "@/components/ui/Field";
import { BusyButton } from "@/components/ui/motion";
import { Card } from "@/components/agent/AgentUi";
import {
  changeAgentPassword,
  updateAgentProfile,
} from "@/lib/data-bundles/agent-actions";

function Notice({ error, saved }: { error: string | null; saved: string | null }) {
  if (error) {
    return (
      <p className="animate-fade-up rounded-xl bg-niki-danger/10 px-4 py-3 text-sm font-medium text-niki-danger">
        {error}
      </p>
    );
  }
  if (saved) {
    return (
      <p className="animate-fade-up flex items-center gap-2 rounded-xl bg-niki-success/10 px-4 py-3 text-sm font-medium text-niki-success">
        <Check className="h-4 w-4" />
        {saved}
      </p>
    );
  }
  return null;
}

/**
 * An agent's own details, edited where they work.
 *
 * The email field asks for the current password only when the email is being
 * changed, so the ordinary case — a new phone number — is one field and a
 * button, and the case that could hand somebody else the account is not.
 */
export function AgentProfileForm({
  initial,
}: {
  initial: { name: string; email: string; phone: string };
}) {
  const router = useRouter();
  const [form, setForm] = useState({ ...initial, currentPassword: "" });
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const changingEmail = form.email.trim().toLowerCase() !== initial.email.toLowerCase();

  function set<K extends keyof typeof form>(key: K, value: (typeof form)[K]) {
    setForm((f) => ({ ...f, [key]: value }));
    setSaved(null);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setPending(true);
    const result = await updateAgentProfile(form);
    setPending(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setSaved(result.message ?? "Saved.");
    setForm((f) => ({ ...f, currentPassword: "" }));
    router.refresh();
  }

  return (
    <Card title="Your details" icon={UserRound}>
      <form onSubmit={submit} className="space-y-4" noValidate>
        <Notice error={error} saved={saved} />

        <div className="grid gap-4 sm:grid-cols-2">
          <label className="block">
            <span className="mb-1.5 block text-sm font-medium text-niki-ink">Full name</span>
            <input
              value={form.name}
              onChange={(e) => set("name", e.target.value)}
              autoComplete="name"
              className={inputClass}
            />
          </label>

          <label className="block">
            <span className="mb-1.5 block text-sm font-medium text-niki-ink">Phone number</span>
            <input
              value={form.phone}
              onChange={(e) => set("phone", e.target.value)}
              inputMode="tel"
              autoComplete="tel"
              maxLength={15}
              className={inputClass}
            />
          </label>
        </div>

        <label className="block">
          <span className="mb-1.5 block text-sm font-medium text-niki-ink">Email</span>
          <input
            value={form.email}
            onChange={(e) => set("email", e.target.value)}
            type="email"
            autoComplete="email"
            className={inputClass}
          />
          <span className="mt-1 block text-xs text-niki-ink/50">You sign in with this.</span>
        </label>

        {changingEmail ? (
          <label className="animate-fade-up block">
            <span className="mb-1.5 block text-sm font-medium text-niki-ink">
              Current password
            </span>
            <input
              value={form.currentPassword}
              onChange={(e) => set("currentPassword", e.target.value)}
              type="password"
              autoComplete="current-password"
              placeholder="Required to change your email"
              className={inputClass}
            />
          </label>
        ) : null}

        <BusyButton
          type="submit"
          busy={pending}
          pendingLabel="Saving…"
          icon={<Save className="h-4 w-4" />}
          className="rounded-xl bg-niki-black px-5 py-2.5 text-sm font-bold text-white"
        >
          Save details
        </BusyButton>
      </form>
    </Card>
  );
}

/** Change the password, in the console rather than through a reset email. */
export function AgentPasswordForm() {
  const [form, setForm] = useState({ currentPassword: "", newPassword: "", confirm: "" });
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  function set<K extends keyof typeof form>(key: K, value: string) {
    setForm((f) => ({ ...f, [key]: value }));
    setSaved(null);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (form.newPassword !== form.confirm) {
      setError("Both new passwords must match.");
      return;
    }
    setPending(true);
    const result = await changeAgentPassword({
      currentPassword: form.currentPassword,
      newPassword: form.newPassword,
    });
    setPending(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setForm({ currentPassword: "", newPassword: "", confirm: "" });
    setSaved(result.message ?? "Password changed.");
  }

  return (
    <Card title="Password" icon={KeyRound}>
      <form onSubmit={submit} className="space-y-4" noValidate>
        <Notice error={error} saved={saved} />

        <label className="block">
          <span className="mb-1.5 block text-sm font-medium text-niki-ink">Current password</span>
          <input
            value={form.currentPassword}
            onChange={(e) => set("currentPassword", e.target.value)}
            type="password"
            autoComplete="current-password"
            className={inputClass}
          />
        </label>

        <div className="grid gap-4 sm:grid-cols-2">
          <label className="block">
            <span className="mb-1.5 block text-sm font-medium text-niki-ink">New password</span>
            <input
              value={form.newPassword}
              onChange={(e) => set("newPassword", e.target.value)}
              type="password"
              minLength={6}
              autoComplete="new-password"
              placeholder="At least 6 characters"
              className={inputClass}
            />
          </label>
          <label className="block">
            <span className="mb-1.5 block text-sm font-medium text-niki-ink">Confirm</span>
            <input
              value={form.confirm}
              onChange={(e) => set("confirm", e.target.value)}
              type="password"
              autoComplete="new-password"
              className={inputClass}
            />
          </label>
        </div>

        <BusyButton
          type="submit"
          busy={pending}
          pendingLabel="Changing…"
          icon={<KeyRound className="h-4 w-4" />}
          className="rounded-xl bg-niki-black px-5 py-2.5 text-sm font-bold text-white"
        >
          Change password
        </BusyButton>
      </form>
    </Card>
  );
}
