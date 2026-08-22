"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Store } from "lucide-react";
import { inputClass } from "@/components/ui/Field";
import { BusyButton } from "@/components/ui/motion";
import { formatPrice } from "@/lib/format";
import { normaliseSlugClient } from "@/lib/data-bundles/slug";
import { joinAgentProgram } from "@/lib/data-bundles/agent-actions";

/**
 * Open a storefront.
 *
 * Four fields, because that is genuinely all it takes — prices, AFA and the
 * rest are set afterwards from inside the platform. The store link previews as
 * it is typed, so nobody discovers what their URL actually became only after
 * committing to it.
 */
export function JoinAgentForm({
  origin,
  setupFee,
  defaultPhone,
}: {
  origin: string;
  setupFee: number;
  defaultPhone: string;
}) {
  const router = useRouter();
  const [storeName, setStoreName] = useState("");
  const [slug, setSlug] = useState("");
  const [slugTouched, setSlugTouched] = useState(false);
  const [supportPhone, setSupportPhone] = useState(defaultPhone);
  const [storeTagline, setStoreTagline] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  // Until the link is edited by hand, it follows the store name.
  const effectiveSlug = slugTouched ? normaliseSlugClient(slug) : normaliseSlugClient(storeName);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setPending(true);
    const result = await joinAgentProgram({
      storeName,
      slug: effectiveSlug,
      supportPhone,
      storeTagline,
    });
    if (!result.ok) {
      setError(result.error);
      setPending(false);
      return;
    }
    // Stay pending through the navigation — the button shouldn't go idle while
    // the dashboard loads.
    router.push("/agent");
    router.refresh();
  }

  return (
    <form onSubmit={submit} className="space-y-4" noValidate>
      {error ? (
        <p className="animate-fade-up rounded-xl bg-niki-danger/10 px-4 py-3 text-sm font-medium text-niki-danger">
          {error}
        </p>
      ) : null}

      <label className="block">
        <span className="mb-1.5 block text-sm font-medium text-niki-ink">
          Store name <span className="text-niki-danger">*</span>
        </span>
        <input
          required
          value={storeName}
          onChange={(e) => setStoreName(e.target.value)}
          placeholder="e.g. Nickland Data"
          className={inputClass}
        />
      </label>

      <label className="block">
        <span className="mb-1.5 block text-sm font-medium text-niki-ink">
          Store link <span className="text-niki-danger">*</span>
        </span>
        <div className="flex flex-col overflow-hidden rounded-xl border border-black/10 sm:flex-row">
          <span className="bg-niki-surface px-4 py-2.5 font-mono text-sm text-niki-ink/50">
            {origin}/store/
          </span>
          <input
            required
            value={slugTouched ? slug : effectiveSlug}
            onChange={(e) => {
              setSlugTouched(true);
              setSlug(e.target.value);
            }}
            placeholder="your-store"
            className="min-w-0 flex-1 border-0 bg-white px-4 py-2.5 font-mono text-sm text-niki-ink outline-none focus:ring-2 focus:ring-inset focus:ring-niki-orange/30"
          />
        </div>
        <span className="mt-1 block text-xs text-niki-ink/50">
          Letters, numbers and hyphens only. You can change it later.
        </span>
      </label>

      <label className="block">
        <span className="mb-1.5 block text-sm font-medium text-niki-ink">
          Support number <span className="text-niki-danger">*</span>
        </span>
        <input
          inputMode="tel"
          required
          value={supportPhone}
          onChange={(e) => setSupportPhone(e.target.value)}
          placeholder="0241234567"
          className={inputClass}
        />
        <span className="mt-1 block text-xs text-niki-ink/50">
          Shown on your storefront so customers can reach you.
        </span>
      </label>

      <label className="block">
        <span className="mb-1.5 block text-sm font-medium text-niki-ink">
          Tagline <span className="font-normal text-niki-ink/50">(optional)</span>
        </span>
        <input
          value={storeTagline}
          onChange={(e) => setStoreTagline(e.target.value)}
          placeholder="Cheap data, delivered in seconds"
          className={inputClass}
        />
      </label>

      <div className="rounded-2xl bg-niki-surface p-4 text-sm">
        <div className="flex items-center justify-between">
          <span className="text-niki-ink/60">Storefront setup</span>
          <span className="font-display text-lg font-bold text-niki-ink">
            {formatPrice(setupFee)}
          </span>
        </div>
        <p className="mt-2 text-xs leading-relaxed text-niki-ink/55">
          Nothing to pay now. The fee is charged against your balance, which starts at −
          {formatPrice(setupFee)} and clears itself out of the commission you earn. Once it passes
          zero, everything above it is yours to withdraw.
        </p>
      </div>

      <BusyButton
        type="submit"
        busy={pending}
        pendingLabel="Opening your store…"
        icon={<Store className="h-4 w-4" />}
        className="w-full rounded-xl bg-niki-orange px-4 py-3.5 text-sm font-bold text-white hover:bg-niki-orange-light"
      >
        Open my store
      </BusyButton>
    </form>
  );
}
