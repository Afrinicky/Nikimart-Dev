"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Check, ExternalLink, Save } from "lucide-react";
import { inputClass } from "@/components/ui/Field";
import { BusyButton } from "@/components/ui/motion";
import { CopyChip } from "@/components/agent/AgentCode";
import { normaliseSlugClient } from "@/lib/data-bundles/slug";
import { updateAgentStore } from "@/lib/data-bundles/agent-actions";

/**
 * Store Link: the name, the public URL, and the contacts customers see.
 *
 * The link preview updates as the slug is typed, so what the customer will get
 * is visible before anything is saved.
 */
export function StoreLinkForm({
  origin,
  initial,
}: {
  origin: string;
  initial: {
    storeName: string;
    slug: string;
    storeTagline: string;
    storeAbout: string;
    supportPhone: string;
    supportWhatsapp: string;
    whatsappGroup: string;
  };
}) {
  const router = useRouter();
  const [form, setForm] = useState(initial);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const preview = normaliseSlugClient(form.slug);
  const fullLink = `${origin}/store/${preview || "your-store"}`;

  function set<K extends keyof typeof form>(key: K, value: (typeof form)[K]) {
    setForm((f) => ({ ...f, [key]: value }));
    setSaved(null);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setPending(true);
    const result = await updateAgentStore(form);
    setPending(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setSaved(result.message ?? "Saved.");
    router.refresh();
  }

  return (
    <form onSubmit={submit} className="space-y-5" noValidate>
      {error ? (
        <p className="animate-fade-up rounded-xl bg-niki-danger/10 px-4 py-3 text-sm font-medium text-niki-danger">
          {error}
        </p>
      ) : null}
      {saved ? (
        <p className="animate-fade-up flex items-center gap-2 rounded-xl bg-niki-success/10 px-4 py-3 text-sm font-medium text-niki-success">
          <Check className="h-4 w-4" />
          {saved}
        </p>
      ) : null}

      {/* The URL, split so the fixed part reads as fixed. */}
      <div>
        <span className="mb-1.5 block text-sm font-medium text-niki-ink">Store URL</span>
        <div className="flex flex-col overflow-hidden rounded-xl border border-black/10 sm:flex-row">
          <span className="bg-niki-surface px-4 py-2.5 font-mono text-sm text-niki-ink/50">
            {origin}/store/
          </span>
          <input
            value={form.slug}
            onChange={(e) => set("slug", e.target.value)}
            placeholder="your-store"
            className="min-w-0 flex-1 border-0 bg-white px-4 py-2.5 font-mono text-sm text-niki-ink outline-none focus:ring-2 focus:ring-inset focus:ring-niki-orange/30"
          />
        </div>
        <span className="mt-1 block text-xs text-niki-ink/50">
          Only letters, numbers and hyphens. No spaces.
        </span>
      </div>

      <div>
        <span className="mb-1.5 block text-sm font-medium text-niki-ink">Full store link</span>
        <div className="flex flex-wrap items-center gap-2 rounded-xl bg-niki-surface p-2">
          <span className="min-w-0 flex-1 truncate px-2 font-mono text-sm text-niki-ink/70">
            {fullLink}
          </span>
          <CopyChip
            value={fullLink}
            className="bg-white text-niki-ink/70 ring-1 ring-black/5 hover:bg-niki-navy/5"
          />
          <a
            href={`/store/${preview}`}
            target="_blank"
            rel="noopener noreferrer"
            className="niki-press flex items-center gap-1.5 rounded-full bg-niki-navy px-3 py-2 text-xs font-semibold text-white"
          >
            <ExternalLink className="h-3.5 w-3.5" />
            Visit
          </a>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block">
          <span className="mb-1.5 block text-sm font-medium text-niki-ink">
            Store name <span className="text-niki-danger">*</span>
          </span>
          <input
            required
            value={form.storeName}
            onChange={(e) => set("storeName", e.target.value)}
            className={inputClass}
          />
        </label>

        <label className="block">
          <span className="mb-1.5 block text-sm font-medium text-niki-ink">Tagline</span>
          <input
            value={form.storeTagline}
            onChange={(e) => set("storeTagline", e.target.value)}
            placeholder="Fast data, any network"
            className={inputClass}
          />
        </label>

        <label className="block">
          <span className="mb-1.5 block text-sm font-medium text-niki-ink">Support call number</span>
          <input
            inputMode="tel"
            value={form.supportPhone}
            onChange={(e) => set("supportPhone", e.target.value)}
            placeholder="0241234567"
            className={inputClass}
          />
        </label>

        <label className="block">
          <span className="mb-1.5 block text-sm font-medium text-niki-ink">Support WhatsApp</span>
          <input
            inputMode="tel"
            value={form.supportWhatsapp}
            onChange={(e) => set("supportWhatsapp", e.target.value)}
            placeholder="0241234567"
            className={inputClass}
          />
        </label>
      </div>

      <label className="block">
        <span className="mb-1.5 block text-sm font-medium text-niki-ink">WhatsApp group link</span>
        <input
          value={form.whatsappGroup}
          onChange={(e) => set("whatsappGroup", e.target.value)}
          placeholder="https://chat.whatsapp.com/…"
          className={inputClass}
        />
      </label>

      <label className="block">
        <span className="mb-1.5 block text-sm font-medium text-niki-ink">
          About your store
          <span className="font-normal text-niki-ink/50"> (shown to customers)</span>
        </span>
        <textarea
          rows={3}
          value={form.storeAbout}
          onChange={(e) => set("storeAbout", e.target.value)}
          placeholder="Tell customers who you are and when you're available."
          className={`${inputClass} resize-y`}
        />
      </label>

      <BusyButton
        type="submit"
        busy={pending}
        pendingLabel="Saving…"
        icon={<Save className="h-4 w-4" />}
        className="rounded-xl bg-niki-orange px-6 py-3 text-sm font-bold text-white hover:bg-niki-orange-light"
      >
        Save store details
      </BusyButton>
    </form>
  );
}
