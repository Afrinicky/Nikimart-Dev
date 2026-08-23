"use client";

import { useState } from "react";
import { BadgeCheck } from "lucide-react";
import { Field, inputClass } from "@/components/ui/Field";
import { BusyButton } from "@/components/ui/motion";
import { formatPrice } from "@/lib/format";
import { registerAfa } from "@/lib/data-bundles/actions";

/**
 * AFA (agent SIM) registration form — pays through Paystack, then submits
 * upstream. `storeSlug` routes it through an agent's storefront so their AFA
 * price applies and they earn the difference.
 */
export function AfaForm({
  price,
  storeSlug,
  trackHref = "/data-bundles/orders",
}: {
  price: number;
  storeSlug?: string;
  trackHref?: string;
}) {
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [done, setDone] = useState<string | null>(null);

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setPending(true);
    const fd = new FormData(e.currentTarget);
    const result = await registerAfa({
      fullName: String(fd.get("fullName") ?? ""),
      phoneNumber: String(fd.get("phoneNumber") ?? ""),
      idNumber: String(fd.get("idNumber") ?? ""),
      dateOfBirth: String(fd.get("dateOfBirth") ?? ""),
      town: String(fd.get("town") ?? ""),
      occupation: String(fd.get("occupation") ?? ""),
      storeSlug,
    });
    if (!result.ok) {
      setError(result.error);
      setPending(false);
      return;
    }
    if (result.authorizationUrl) {
      window.location.href = result.authorizationUrl;
      return;
    }
    setDone(result.reference);
    setPending(false);
  }

  if (done) {
    return (
      <div className="animate-scale-in rounded-2xl bg-niki-success/10 p-6 text-center ring-1 ring-niki-success/30">
        <BadgeCheck className="mx-auto h-8 w-8 text-niki-success" />
        <p className="mt-2 font-display font-bold text-niki-ink">Registration submitted</p>
        <p className="mt-1 text-sm text-niki-ink/70">
          Reference <span className="font-mono font-semibold">{done}</span>. We&apos;ll text you
          once it&apos;s approved.
        </p>
        <a
          href={`${trackHref}?q=${encodeURIComponent(done)}`}
          className="niki-press mt-4 inline-flex rounded-full bg-niki-navy px-5 py-2.5 text-sm font-semibold text-white"
        >
          Check status
        </a>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="space-y-4" noValidate>
      {error ? (
        <p className="animate-fade-up rounded-xl bg-niki-danger/10 px-4 py-3 text-sm font-medium text-niki-danger">
          {error}
        </p>
      ) : null}

      <Field label="Full name" htmlFor="fullName" hint="Exactly as it appears on the Ghana Card">
        <input id="fullName" name="fullName" required className={inputClass} />
      </Field>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Phone number" htmlFor="phoneNumber" hint="The number being registered">
          <input id="phoneNumber" name="phoneNumber" inputMode="tel" required placeholder="0241234567" className={inputClass} />
        </Field>
        <Field label="Ghana Card number" htmlFor="idNumber">
          <input id="idNumber" name="idNumber" required placeholder="GHA-123456789-0" className={inputClass} />
        </Field>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Date of birth" htmlFor="dateOfBirth">
          <input id="dateOfBirth" name="dateOfBirth" type="date" required className={inputClass} />
        </Field>
        <Field label="Town / city" htmlFor="town">
          <input id="town" name="town" required placeholder="Accra" className={inputClass} />
        </Field>
      </div>

      <Field label="Occupation" htmlFor="occupation">
        <input id="occupation" name="occupation" required placeholder="Teacher" className={inputClass} />
      </Field>

      <div className="flex items-center justify-between rounded-2xl bg-niki-surface px-4 py-3">
        <span className="text-sm text-niki-ink/60">Registration fee</span>
        <span className="font-figures text-xl font-bold text-niki-ink">{formatPrice(price)}</span>
      </div>

      <BusyButton
        type="submit"
        busy={pending}
        pendingLabel="Opening Paystack…"
        icon={<BadgeCheck className="h-4 w-4" />}
        className="w-full rounded-xl bg-niki-orange px-4 py-3.5 text-sm font-bold text-white hover:bg-niki-orange-light"
      >
        {`Pay ${formatPrice(price)} & register`}
      </BusyButton>
      <p className="text-center text-[11px] text-niki-ink/40">
        Secured by Paystack · MTN MoMo, Telecel Cash, AT Money & cards
      </p>
    </form>
  );
}
