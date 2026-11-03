"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, Loader2 } from "lucide-react";
import { inputClass } from "@/components/ui/Field";
import { loadServiceDraft } from "@/lib/data-bundles/service-actions";

/**
 * Picking a saved application back up.
 *
 * A code rather than an account, because the store sells to guests and a login
 * screen between somebody and a form they already half-filled is a worse trade
 * than six characters they wrote down.
 */
export function ServiceResumeForm() {
  const router = useRouter();
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setPending(true);
    const result = await loadServiceDraft(code);
    if (!result.ok) {
      setError(result.error);
      setPending(false);
      return;
    }
    router.push(
      `/data-bundles/services/${result.draft.serviceSlug}?code=${encodeURIComponent(result.draft.code)}`,
    );
  }

  return (
    <form onSubmit={submit} className="space-y-3" noValidate>
      {error ? (
        <p className="animate-fade-up rounded-xl bg-niki-danger/10 px-4 py-3 text-sm font-medium text-niki-danger">
          {error}
        </p>
      ) : null}

      <label className="block">
        <span className="mb-1.5 block text-sm font-medium text-niki-ink">Your code</span>
        <input
          value={code}
          onChange={(e) => setCode(e.target.value.toUpperCase())}
          placeholder="SV-7K3P9D"
          autoFocus
          maxLength={12}
          className={`${inputClass} font-mono tracking-widest`}
        />
      </label>

      <button
        type="submit"
        disabled={pending || code.trim().length < 6}
        className="niki-press flex w-full items-center justify-center gap-2 rounded-xl bg-niki-orange px-4 py-3.5 text-sm font-bold text-white hover:bg-niki-orange-light disabled:opacity-60"
      >
        {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowRight className="h-4 w-4" />}
        {pending ? "Opening…" : "Continue my application"}
      </button>
    </form>
  );
}
