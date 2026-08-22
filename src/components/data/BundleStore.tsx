"use client";

import { useMemo, useState } from "react";
import { Check, Loader2, Signal, X, Zap } from "lucide-react";
import { inputClass } from "@/components/ui/Field";
import { formatPrice } from "@/lib/format";
import { cn } from "@/lib/cn";
import {
  NETWORK_INFO,
  bundleLabel,
  networkForPhone,
  phoneMatchesNetwork,
  toLocalGhPhone,
  type Network,
} from "@/lib/data-bundles/networks";
import { buyBundle } from "@/lib/data-bundles/actions";

export interface StoreBundle {
  network: Network;
  sizeGb: number;
  price: number;
  validity: string;
}

export interface NetworkGroup {
  network: Network;
  bundles: StoreBundle[];
}

/**
 * The storefront: pick a network, pick a size, pay. Selecting a bundle opens a
 * checkout sheet rather than a separate page, so a buyer who mistypes a number
 * never loses their place in the grid.
 */
export function BundleStore({ groups }: { groups: NetworkGroup[] }) {
  const [network, setNetwork] = useState<Network>(groups[0]?.network ?? "MTN");
  const [selected, setSelected] = useState<StoreBundle | null>(null);

  const active = useMemo(
    () => groups.find((g) => g.network === network) ?? groups[0],
    [groups, network],
  );

  if (groups.length === 0) {
    return (
      <div className="rounded-3xl bg-white p-10 text-center ring-1 ring-black/5">
        <p className="font-display text-lg font-bold text-niki-ink">No bundles on sale yet</p>
        <p className="mt-2 text-sm text-niki-ink/60">
          Prices are being set up. Please check back shortly.
        </p>
      </div>
    );
  }

  return (
    <div>
      {/* Network tabs */}
      <div className="scrollbar-none -mx-4 flex gap-2.5 overflow-x-auto px-4 pb-1 sm:mx-0 sm:px-0">
        {groups.map((g) => {
          const info = NETWORK_INFO[g.network];
          const isActive = g.network === network;
          return (
            <button
              key={g.network}
              type="button"
              onClick={() => setNetwork(g.network)}
              aria-pressed={isActive}
              className={cn(
                "flex shrink-0 items-center gap-2 rounded-2xl px-4 py-3 text-sm font-bold transition-all",
                isActive
                  ? "text-white shadow-lg ring-2 ring-white/60"
                  : "bg-white text-niki-ink/70 ring-1 ring-black/5 hover:bg-niki-navy/5",
              )}
              style={
                isActive
                  ? {
                      background: `linear-gradient(135deg, ${info.accentFrom}, ${info.accentTo})`,
                      color: info.onAccent,
                    }
                  : undefined
              }
            >
              <span
                className="flex h-6 w-6 items-center justify-center rounded-lg text-[10px] font-black"
                style={{ background: isActive ? "rgba(255,255,255,.25)" : info.accentFrom, color: info.onAccent }}
              >
                <Signal className="h-3.5 w-3.5" />
              </span>
              {info.label}
            </button>
          );
        })}
      </div>

      {active ? (
        <>
          <p className="mt-4 text-sm text-niki-ink/60">{NETWORK_INFO[active.network].blurb}</p>

          {/* Bundle grid */}
          <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {active.bundles.map((b) => {
              const info = NETWORK_INFO[b.network];
              const perGb = b.price / b.sizeGb;
              return (
                <button
                  key={`${b.network}-${b.sizeGb}`}
                  type="button"
                  onClick={() => setSelected(b)}
                  className="group relative overflow-hidden rounded-2xl bg-white p-4 text-left ring-1 ring-black/5 transition-all hover:-translate-y-0.5 hover:ring-2 hover:ring-niki-orange/40 hover:shadow-lg"
                >
                  <span
                    className="absolute inset-x-0 top-0 h-1.5"
                    style={{ background: `linear-gradient(90deg, ${info.accentFrom}, ${info.accentTo})` }}
                  />
                  <p className="font-display text-2xl font-bold text-niki-ink">{bundleLabel(b.sizeGb)}</p>
                  <p className="mt-0.5 text-xs text-niki-ink/50">{b.validity}</p>
                  <p className="mt-3 font-display text-lg font-bold text-niki-orange">
                    {formatPrice(b.price)}
                  </p>
                  <p className="text-[11px] text-niki-ink/40">{formatPrice(Math.round(perGb * 100) / 100)}/GB</p>
                  <span className="mt-3 flex w-full items-center justify-center gap-1.5 rounded-xl bg-niki-navy px-3 py-2 text-xs font-bold text-white transition-colors group-hover:bg-niki-orange">
                    <Zap className="h-3.5 w-3.5" />
                    Buy now
                  </span>
                </button>
              );
            })}
          </div>
        </>
      ) : null}

      {selected ? <CheckoutSheet bundle={selected} onClose={() => setSelected(null)} /> : null}
    </div>
  );
}

/** The buy form, as a bottom sheet on mobile and a centred dialog on desktop. */
function CheckoutSheet({ bundle, onClose }: { bundle: StoreBundle; onClose: () => void }) {
  const info = NETWORK_INFO[bundle.network];
  const [recipientPhone, setRecipientPhone] = useState("");
  const [buyerPhone, setBuyerPhone] = useState("");
  const [buyerEmail, setBuyerEmail] = useState("");
  const [buyerName, setBuyerName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [done, setDone] = useState<string | null>(null);

  // Live feedback on the recipient number: the provider charges us for a send
  // to the wrong network, so flag the mismatch before payment, not after.
  const local = toLocalGhPhone(recipientPhone);
  const detected = local ? networkForPhone(local) : null;
  const mismatch = Boolean(local && !phoneMatchesNetwork(local, bundle.network));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setPending(true);
    const result = await buyBundle({
      network: bundle.network,
      sizeGb: bundle.sizeGb,
      recipientPhone,
      buyerPhone: buyerPhone || recipientPhone,
      buyerEmail,
      buyerName,
    });
    if (!result.ok) {
      setError(result.error);
      setPending(false);
      return;
    }
    if (result.authorizationUrl) {
      // Hand over to Paystack's hosted MoMo/card checkout.
      window.location.href = result.authorizationUrl;
      return;
    }
    setDone(result.reference);
    setPending(false);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-niki-navy/60 backdrop-blur-sm sm:items-center">
      <button type="button" aria-label="Close" className="absolute inset-0" onClick={onClose} />
      <div className="relative z-10 max-h-[92vh] w-full overflow-y-auto rounded-t-3xl bg-white p-5 shadow-2xl sm:max-w-md sm:rounded-3xl sm:p-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <span
              className="inline-flex rounded-full px-2.5 py-1 text-[11px] font-bold"
              style={{ background: info.accentFrom, color: info.onAccent }}
            >
              {info.label}
            </span>
            <p className="mt-2 font-display text-2xl font-bold text-niki-ink">
              {bundleLabel(bundle.sizeGb)} · {formatPrice(bundle.price)}
            </p>
            <p className="text-xs text-niki-ink/50">{bundle.validity}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="rounded-full p-1.5 text-niki-ink/40 hover:bg-niki-surface hover:text-niki-ink"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {done ? (
          <div className="mt-6 rounded-2xl bg-niki-success/10 p-5 text-center ring-1 ring-niki-success/30">
            <Check className="mx-auto h-8 w-8 text-niki-success" />
            <p className="mt-2 font-display font-bold text-niki-ink">Order placed</p>
            <p className="mt-1 text-sm text-niki-ink/70">
              Reference <span className="font-mono font-semibold">{done}</span>. We&apos;ll text{" "}
              {toLocalGhPhone(buyerPhone || recipientPhone)} once the data lands.
            </p>
            <a
              href={`/data-bundles/orders?q=${encodeURIComponent(done)}`}
              className="mt-4 inline-flex rounded-full bg-niki-navy px-5 py-2.5 text-sm font-semibold text-white"
            >
              Track this order
            </a>
          </div>
        ) : (
          <form onSubmit={submit} className="mt-5 space-y-4" noValidate>
            {error ? (
              <p className="rounded-xl bg-niki-danger/10 px-4 py-3 text-sm font-medium text-niki-danger">
                {error}
              </p>
            ) : null}

            <label className="block">
              <span className="mb-1.5 block text-sm font-medium text-niki-ink">
                Number to top up
              </span>
              <input
                inputMode="tel"
                autoComplete="tel"
                required
                value={recipientPhone}
                onChange={(e) => setRecipientPhone(e.target.value)}
                placeholder="0241234567"
                className={inputClass}
              />
              {mismatch ? (
                <span className="mt-1 block text-xs font-medium text-niki-danger">
                  That looks like {detected ? NETWORK_INFO[detected].label : "another network"}. Data
                  sent to the wrong network can&apos;t be reversed.
                </span>
              ) : (
                <span className="mt-1 block text-xs text-niki-ink/50">
                  The data is credited to this number. Double-check it.
                </span>
              )}
            </label>

            <label className="block">
              <span className="mb-1.5 block text-sm font-medium text-niki-ink">Your number</span>
              <input
                inputMode="tel"
                autoComplete="tel"
                value={buyerPhone}
                onChange={(e) => setBuyerPhone(e.target.value)}
                placeholder="For your receipt — same as above if it's for you"
                className={inputClass}
              />
            </label>

            <div className="grid gap-4 sm:grid-cols-2">
              <label className="block">
                <span className="mb-1.5 block text-sm font-medium text-niki-ink">Name (optional)</span>
                <input
                  value={buyerName}
                  onChange={(e) => setBuyerName(e.target.value)}
                  className={inputClass}
                />
              </label>
              <label className="block">
                <span className="mb-1.5 block text-sm font-medium text-niki-ink">Email (optional)</span>
                <input
                  type="email"
                  autoComplete="email"
                  value={buyerEmail}
                  onChange={(e) => setBuyerEmail(e.target.value)}
                  className={inputClass}
                />
              </label>
            </div>

            <div className="flex items-center justify-between rounded-2xl bg-niki-surface px-4 py-3">
              <span className="text-sm text-niki-ink/60">Total</span>
              <span className="font-display text-xl font-bold text-niki-ink">
                {formatPrice(bundle.price)}
              </span>
            </div>

            <button
              type="submit"
              disabled={pending}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-niki-orange px-4 py-3.5 text-sm font-bold text-white transition-colors hover:bg-niki-orange-light disabled:cursor-not-allowed disabled:opacity-60"
            >
              {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Zap className="h-4 w-4" />}
              {pending ? "Starting payment…" : `Pay ${formatPrice(bundle.price)} with MoMo`}
            </button>
            <p className="text-center text-[11px] text-niki-ink/40">
              Secured by Paystack · MTN MoMo, Telecel Cash, AT Money & cards
            </p>
          </form>
        )}
      </div>
    </div>
  );
}
