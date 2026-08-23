"use client";

import { useEffect, useMemo, useState } from "react";
import { Check, CreditCard, X } from "lucide-react";
import { inputClass } from "@/components/ui/Field";
import { ActionLink, BusyButton } from "@/components/ui/motion";
import { BundleCard, NetworkTabs } from "@/components/data/BundleCard";
import { formatMoney } from "@/lib/format";
import { cn } from "@/lib/cn";
import { NETWORK_INFO, bundleLabel, type Network } from "@/lib/data-bundles/networks";
import { checkRecipient } from "@/lib/data-bundles/gh-phone";
import { agentTopup } from "@/lib/data-bundles/agent-actions";

export interface TopupBundle {
  network: Network;
  sizeGb: number;
  /** What the agent pays — their wholesale rate. */
  agentPrice: number;
  /** What their own storefront charges, shown so they can quote a customer. */
  storePrice: number;
  validity: string;
}

/**
 * Data Topup: the agent serving a walk-in customer from their own dashboard.
 *
 * They pay the agent price through Paystack there and then — no wallet to
 * stock, nothing fronted. Each card shows both numbers: what it costs them and
 * what their store charges, so the margin is never a mental sum.
 */
export function AgentTopup({ bundles }: { bundles: TopupBundle[] }) {
  const networks = useMemo(() => {
    const seen: Network[] = [];
    for (const b of bundles) if (!seen.includes(b.network)) seen.push(b.network);
    return seen;
  }, [bundles]);

  const [network, setNetwork] = useState<Network>(networks[0] ?? "MTN");
  const [selected, setSelected] = useState<TopupBundle | null>(null);

  const shown = useMemo(
    () => bundles.filter((b) => b.network === network).sort((a, b) => a.sizeGb - b.sizeGb),
    [bundles, network],
  );

  if (bundles.length === 0) {
    return (
      <div className="animate-fade-up rounded-2xl bg-white p-8 text-center ring-1 ring-niki-edge">
        <p className="font-display font-bold text-niki-ink">No bundles available yet</p>
        <p className="mt-2 text-sm text-niki-ink/60">
          NikiMart hasn&apos;t published agent prices for any bundle. Check back shortly, or ask
          support.
        </p>
      </div>
    );
  }

  return (
    <div>
      <NetworkTabs networks={networks} value={network} onChange={setNetwork} />

      <div
        key={network}
        className="stagger-children mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-3"
      >
        {shown.map((b) => {
          const margin = Math.round((b.storePrice - b.agentPrice) * 100) / 100;
          return (
            <BundleCard
              key={`${b.network}-${b.sizeGb}`}
              network={b.network}
              sizeGb={b.sizeGb}
              price={b.agentPrice}
              validity={b.validity}
              costLabel="Your cost"
              actionLabel="Send now"
              footnote={
                margin > 0
                  ? `Your store sells this at ${formatMoney(b.storePrice)} — ${formatMoney(margin)} margin`
                  : undefined
              }
              onSelect={() => setSelected(b)}
            />
          );
        })}
      </div>

      {selected ? <TopupDialog bundle={selected} onClose={() => setSelected(null)} /> : null}
    </div>
  );
}

function TopupDialog({ bundle, onClose }: { bundle: TopupBundle; onClose: () => void }) {
  const info = NETWORK_INFO[bundle.network];
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [done, setDone] = useState<string | null>(null);

  // The same check the server runs, so the button can be blocked before a
  // payment is ever started. Only complain once there's enough typed to judge —
  // flagging "too short" on the first keystroke is just nagging.
  const check = checkRecipient(phone, bundle.network, info.label);
  const worthJudging = phone.replace(/\D/g, "").length >= 10;
  const phoneProblem = !check.ok && worthJudging ? check.message : null;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !pending) onClose();
    };
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [onClose, pending]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setPending(true);
    const result = await agentTopup({
      network: bundle.network,
      sizeGb: bundle.sizeGb,
      recipientPhone: phone,
      email,
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

  return (
    <div className="animate-fade-in fixed inset-0 z-50 flex items-end justify-center bg-niki-navy/70 backdrop-blur-sm sm:items-center">
      <button
        type="button"
        aria-label="Close"
        className="absolute inset-0"
        onClick={() => !pending && onClose()}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Pay with Paystack"
        className="animate-sheet-up relative z-10 max-h-[92dvh] w-full overflow-y-auto rounded-t-3xl bg-white pb-[max(env(safe-area-inset-bottom),4.5rem)] shadow-2xl sm:max-w-md sm:rounded-3xl sm:pb-0"
      >
        <div className="flex items-center justify-between gap-4 border-b border-niki-edge px-5 py-4">
          <p className="font-display text-lg font-bold text-niki-ink">Pay with Paystack</p>
          <button
            type="button"
            onClick={() => !pending && onClose()}
            aria-label="Close"
            className="niki-press niki-focus rounded-full p-1.5 text-niki-ink/40 hover:bg-niki-surface hover:text-niki-ink"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="p-5">
          {done ? (
            <div className="animate-scale-in rounded-2xl bg-niki-success/10 p-5 text-center ring-1 ring-niki-success/30">
              <Check className="mx-auto h-8 w-8 text-niki-success" />
              <p className="mt-2 font-display font-bold text-niki-ink">Order placed</p>
              <p className="mt-1 text-sm text-niki-ink/70">
                Reference <span className="font-mono font-semibold">{done}</span>.
              </p>
              <ActionLink
                href="/agent/orders"
                className="mt-4 inline-flex rounded-full bg-niki-navy px-5 py-2.5 text-sm font-semibold text-white"
              >
                See my orders
              </ActionLink>
            </div>
          ) : (
            <form onSubmit={submit} className="space-y-4" noValidate>
              <dl className="rounded-2xl bg-niki-surface p-4 text-sm">
                <div className="flex items-center justify-between py-1">
                  <dt className="text-niki-ink/55">Network</dt>
                  <dd className="font-semibold text-niki-ink">{info.label}</dd>
                </div>
                <div className="flex items-center justify-between py-1">
                  <dt className="text-niki-ink/55">Data Size</dt>
                  <dd className="font-semibold text-niki-ink">{bundleLabel(bundle.sizeGb)}</dd>
                </div>
                <div className="flex items-center justify-between py-1">
                  <dt className="text-niki-ink/55">Amount to pay</dt>
                  <dd className="font-figures text-lg font-bold text-niki-orange">
                    {formatMoney(bundle.agentPrice)}
                  </dd>
                </div>
              </dl>

              {error ? (
                <p className="animate-fade-up rounded-xl bg-niki-danger/10 px-4 py-3 text-sm font-medium text-niki-danger">
                  {error}
                </p>
              ) : null}

              <label className="block">
                <span className="mb-1.5 block text-sm font-medium text-niki-ink">
                  Phone Number <span className="text-niki-danger">*</span>
                </span>
                <input
                  inputMode="tel"
                  autoComplete="tel"
                  autoFocus
                  required
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="0241234567"
                  maxLength={15}
                  aria-invalid={phoneProblem ? true : undefined}
                  className={cn(
                    inputClass,
                    phoneProblem && "border-niki-danger focus:border-niki-danger focus:ring-niki-danger/20",
                  )}
                />
                {phoneProblem ? (
                  <span
                    role="alert"
                    className="animate-fade-in mt-1 block text-xs font-medium text-niki-danger"
                  >
                    {phoneProblem}
                  </span>
                ) : (
                  <span className="mt-1 block text-xs text-niki-ink/50">
                    10 digits starting with 0. The data is credited to this number.
                  </span>
                )}
              </label>

              <label className="block">
                <span className="mb-1.5 block text-sm font-medium text-niki-ink">
                  Email <span className="font-normal text-niki-ink/50">(optional)</span>
                </span>
                <input
                  type="email"
                  autoComplete="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="customer@example.com"
                  className={inputClass}
                />
              </label>

              <div className="flex gap-3 pt-1">
                <button
                  type="button"
                  onClick={onClose}
                  disabled={pending}
                  className="niki-press niki-focus flex-1 rounded-xl bg-niki-surface px-4 py-3 text-sm font-bold text-niki-ink/70 hover:bg-niki-navy/5 disabled:opacity-60"
                >
                  Cancel
                </button>
                <BusyButton
                  type="submit"
                  busy={pending}
                  disabled={!check.ok}
                  pendingLabel="Opening Paystack…"
                  icon={<CreditCard className="h-4 w-4" />}
                  className="flex-[1.6] whitespace-nowrap rounded-xl bg-niki-orange px-4 py-3 text-sm font-bold text-white hover:bg-niki-orange-light"
                >
                  Continue to Paystack
                </BusyButton>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
