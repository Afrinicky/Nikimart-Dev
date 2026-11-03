"use client";

import { useEffect, useMemo, useState } from "react";
import { Check, CreditCard, X } from "lucide-react";
import { inputClass } from "@/components/ui/Field";
import { BusyButton } from "@/components/ui/motion";
import { BundleCard, NetworkTabs } from "@/components/data/BundleCard";
import { ServiceCard, type StoreService } from "@/components/data/ServiceCard";
import { ServiceContinuePanel } from "@/components/data/ServiceContinuePanel";
import { formatMoney } from "@/lib/format";
import { cn } from "@/lib/cn";
import { NETWORK_INFO, bundleLabel, type Network } from "@/lib/data-bundles/networks";
import { checkRecipient } from "@/lib/data-bundles/gh-phone";
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
 * The storefront: pick a network, pick a size, pay. No cart and no account —
 * every bundle is a one-off Paystack payment, so tapping a bundle goes straight
 * to the pay dialog.
 *
 * `storeSlug` routes the sale through an agent's storefront: the server prices
 * it from that agent's ladder and credits them the difference. Omitted on
 * Nickimart's own /data-bundles page.
 *
 * `services` adds one more tab at the end of the operators — registrations and
 * certificates, the business's second shelf. It is a tab rather than a section
 * further down the page because it is another thing this store sells, and a
 * buyer should be able to find it in the same place they find MTN. The grid
 * behind it is the same grid; only what is on the cards differs.
 */
export function BundleStore({
  groups,
  storeSlug,
  trackHref = "/data-bundles/orders",
  services = [],
  servicesLabel = "Services",
  servicesBase = "/data-bundles/services",
}: {
  groups: NetworkGroup[];
  storeSlug?: string;
  trackHref?: string;
  /** The services shelf, empty when this store sells none. */
  services?: StoreService[];
  servicesLabel?: string;
  /** Where a service card leads: Nickimart's own, or this agent's copy. */
  servicesBase?: string;
}) {
  const [network, setNetwork] = useState<Network>(groups[0]?.network ?? "MTN");
  const [onServices, setOnServices] = useState(false);
  const [selected, setSelected] = useState<StoreBundle | null>(null);

  const active = useMemo(
    () => groups.find((g) => g.network === network) ?? groups[0],
    [groups, network],
  );

  // A store with services but no priced bundles still has something to sell,
  // so the empty state only applies when there is genuinely nothing.
  if (groups.length === 0 && services.length === 0) {
    return (
      <div className="animate-fade-up rounded-3xl bg-white p-10 text-center ring-1 ring-niki-edge">
        <p className="font-display text-lg font-bold text-niki-ink">No bundles on sale yet</p>
        <p className="mt-2 text-sm text-niki-ink/60">
          Prices are being set up. Please check back shortly.
        </p>
      </div>
    );
  }

  return (
    <div>
      {/* Network chooser, with the services shelf at the end of the row. */}
      <NetworkTabs
        networks={groups.map((g) => g.network)}
        value={network}
        onChange={(n) => {
          setNetwork(n);
          setOnServices(false);
        }}
        services={
          services.length > 0
            ? {
                label: servicesLabel,
                active: onServices,
                onSelect: () => setOnServices(true),
              }
            : undefined
        }
      />

      {onServices ? (
        <>
          <p className="mt-4 text-sm text-niki-ink/60">
            Registrations and certificates, handled end to end. Pick one to apply.
          </p>
          {/* Keyed so switching tabs re-runs the stagger — the change is then
              visibly a change, rather than a swap. */}
          <div
            key="services"
            className="stagger-children mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4"
          >
            {services.map((s) => (
              <ServiceCard key={s.slug} service={s} href={`${servicesBase}/${s.slug}`} />
            ))}
          </div>

          {/* The way back in. These forms are long and the documents come
              later, so most people are here a second time rather than a
              first — and until now the only door was a code they had to have
              kept, on a page nothing linked to. */}
          <div className="mt-4">
            <ServiceContinuePanel />
          </div>
        </>
      ) : null}

      {!onServices && active ? (
        <>
          <p className="mt-4 text-sm text-niki-ink/60">{NETWORK_INFO[active.network].blurb}</p>

          {/* One column on a phone so each card keeps its full width and the
              two numbers stay side by side; the desktop grid is unchanged.
              Keyed on the network so switching re-runs the stagger — the change
              is then visibly a change, not a swap. */}
          <div
            key={active.network}
            className="stagger-children mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4"
          >
            {active.bundles.map((b) => (
              <BundleCard
                key={`${b.network}-${b.sizeGb}`}
                network={b.network}
                sizeGb={b.sizeGb}
                price={b.price}
                validity={b.validity}
                onSelect={() => setSelected(b)}
              />
            ))}
          </div>
        </>
      ) : null}

      {selected ? (
        <PaystackDialog
          bundle={selected}
          storeSlug={storeSlug}
          trackHref={trackHref}
          onClose={() => setSelected(null)}
        />
      ) : null}
    </div>
  );
}

/**
 * "Pay with Paystack" — the whole checkout.
 *
 * It asks for the number to top up and, optionally, an email for the receipt.
 * Nothing else: there is no separate buyer number and no name field, because
 * the number being credited is also how the buyer looks the order up later.
 */
export function PaystackDialog({
  bundle,
  storeSlug,
  trackHref = "/data-bundles/orders",
  onClose,
}: {
  bundle: StoreBundle;
  storeSlug?: string;
  trackHref?: string;
  onClose: () => void;
}) {
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

  // Escape closes; the body stops scrolling behind the dialog.
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
    const result = await buyBundle({
      network: bundle.network,
      sizeGb: bundle.sizeGb,
      recipientPhone: phone,
      buyerEmail: email,
      storeSlug,
    });
    if (!result.ok) {
      setError(result.error);
      setPending(false);
      return;
    }
    if (result.authorizationUrl) {
      // Hand over to Paystack's hosted MoMo/card checkout. Stay "pending" —
      // the spinner should survive right up to the redirect.
      window.location.href = result.authorizationUrl;
      return;
    }
    setDone(result.reference);
    setPending(false);
  }

  return (
    <div className="animate-fade-in fixed inset-0 z-50 flex items-end justify-center bg-niki-black/70 backdrop-blur-sm sm:items-center">
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
        {/* Header */}
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
                Reference <span className="font-mono font-semibold">{done}</span>. We&apos;ll text{" "}
                {check.ok ? check.local : phone} once the data lands.
              </p>
              <a
                href={`${trackHref}?q=${encodeURIComponent(done)}`}
                className="niki-press mt-4 inline-flex rounded-full bg-niki-black px-5 py-2.5 text-sm font-semibold text-white"
              >
                Track this order
              </a>
            </div>
          ) : (
            <form onSubmit={submit} className="space-y-4" noValidate>
              {/* What you're buying, and what it costs. */}
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
                    {formatMoney(bundle.price)}
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
                  className="niki-press niki-focus flex-1 rounded-xl bg-niki-surface px-4 py-3 text-sm font-bold text-niki-ink/70 hover:bg-niki-black/5 disabled:opacity-60"
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

              <p className="text-center text-[11px] text-niki-ink/40">
                Secured by Paystack · MTN MoMo, Telecel Cash, AT Money &amp; cards
              </p>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
