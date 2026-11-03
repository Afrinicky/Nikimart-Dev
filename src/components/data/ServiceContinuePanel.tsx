"use client";

import { useState } from "react";
import {
  ArrowRight,
  Bookmark,
  Clock3,
  FileText,
  Loader2,
  Paperclip,
  Search,
} from "lucide-react";
import { ActionLink } from "@/components/ui/motion";
import { inputBase } from "@/components/ui/Field";
import {
  findInFlight,
  type InFlightDraft,
  type InFlightOrder,
} from "@/lib/data-bundles/service-actions";
import { cn } from "@/lib/cn";

/**
 * "Continue where you left off."
 *
 * One box, four ways in — the code, the reference, the phone number, the
 * email — because what somebody still has in hand a fortnight later is not
 * predictable, and a box that only takes the code is a box that only works
 * for people who did not lose it.
 *
 * It finds both kinds of unfinished: a form saved halfway, and an order
 * already paid for whose documents are still to come. People do not
 * distinguish between those two, so neither does the box; the answer says
 * which is which and leads straight back to the step they stopped at.
 *
 * Used in two places from one component: inline under the services grid,
 * where somebody who already has a code is standing, and on its own page for
 * a link sent to them.
 */

function when(date: Date): string {
  return new Date(date).toLocaleDateString("en-GH", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export function ServiceContinuePanel({
  /** Open with the box already showing, for the page that is only this. */
  defaultOpen = false,
  /** The standalone page has its own heading. */
  heading = "Already started?",
  blurb = "Enter your code, your order reference, or the phone number or email you used.",
}: {
  defaultOpen?: boolean;
  heading?: string;
  blurb?: string;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const [query, setQuery] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<InFlightDraft[]>([]);
  const [orders, setOrders] = useState<InFlightOrder[]>([]);
  const [who, setWho] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setPending(true);
    const result = await findInFlight(query);
    setPending(false);
    if (!result.ok) {
      setDrafts([]);
      setOrders([]);
      setWho(null);
      setError(result.error);
      return;
    }
    setDrafts(result.drafts);
    setOrders(result.orders);
    setWho(result.who);
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="niki-press niki-focus flex w-full items-center gap-3 rounded-2xl bg-white px-5 py-4 text-left ring-1 ring-niki-edge hover:ring-niki-edge-strong"
      >
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-niki-orange/10 text-niki-orange">
          <Bookmark className="h-5 w-5" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block font-display font-bold text-niki-ink">{heading}</span>
          <span className="block text-sm text-niki-ink/55">
            Pick up a saved form, or add documents to an application you have paid for.
          </span>
        </span>
        <ArrowRight className="h-4 w-4 shrink-0 text-niki-ink/35" />
      </button>
    );
  }

  return (
    <div className="animate-fade-up rounded-2xl bg-white p-5 ring-1 ring-niki-edge">
      <div className="flex items-start gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-niki-orange/10 text-niki-orange">
          <Bookmark className="h-5 w-5" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="font-display font-bold text-niki-ink">{heading}</p>
          <p className="mt-0.5 text-sm text-niki-ink/55">{blurb}</p>
        </div>
      </div>

      <form onSubmit={submit} className="mt-4 flex flex-wrap gap-2" noValidate>
        <label className="relative min-w-[12rem] flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-niki-ink/35" />
          <span className="sr-only">Code, reference, phone number or email</span>
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="SV-7K3P9D, NS-… , 0241234567 or your email"
            autoFocus={!defaultOpen}
            className={cn(inputBase, "w-full pl-9")}
          />
        </label>
        <button
          type="submit"
          disabled={pending || query.trim().length < 4}
          className="niki-press flex items-center gap-2 rounded-xl bg-niki-orange px-5 py-2.5 text-sm font-bold text-white hover:bg-niki-orange-light disabled:opacity-60"
        >
          {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
          {pending ? "Looking…" : "Find it"}
        </button>
      </form>

      {error ? (
        <p className="animate-fade-up mt-3 rounded-xl bg-niki-surface px-4 py-3 text-sm text-niki-ink/65">
          {error}
        </p>
      ) : null}

      {who && (drafts.length > 0 || orders.length > 0) ? (
        <div className="animate-fade-up mt-4 space-y-2">
          <p className="text-xs font-semibold uppercase tracking-wide text-niki-ink/45">
            Found for {who}
          </p>

          {orders.map((o) => (
            <ActionLink
              key={o.reference}
              href={o.href}
              className="niki-press flex items-center gap-3 rounded-xl bg-niki-surface px-4 py-3 text-left hover:bg-niki-black/5"
            >
              <FileText className="h-4 w-4 shrink-0 text-niki-ink/40" />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-semibold text-niki-ink">
                  {o.serviceName} — {o.variantName}
                </span>
                <span className="block text-xs text-niki-ink/55">
                  {o.paymentStatus === "paid" ? (
                    o.outstanding > 0 ? (
                      <span className="font-semibold text-niki-orange">
                        <Paperclip className="mr-1 inline h-3 w-3" />
                        {o.outstanding} document{o.outstanding === 1 ? "" : "s"} still needed
                      </span>
                    ) : (
                      "Paid · nothing outstanding"
                    )
                  ) : (
                    <span className="font-semibold text-niki-orange">Awaiting payment</span>
                  )}
                  {" · "}
                  {o.reference}
                </span>
              </span>
              <ArrowRight className="h-4 w-4 shrink-0 text-niki-ink/35" />
            </ActionLink>
          ))}

          {drafts.map((d) => (
            <ActionLink
              key={d.code}
              href={d.href}
              className="niki-press flex items-center gap-3 rounded-xl bg-niki-surface px-4 py-3 text-left hover:bg-niki-black/5"
            >
              <Bookmark className="h-4 w-4 shrink-0 text-niki-ink/40" />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-semibold text-niki-ink">
                  {d.serviceName} — saved form
                </span>
                <span className="flex items-center gap-1 text-xs text-niki-ink/55">
                  <Clock3 className="h-3 w-3" />
                  Saved {when(d.savedAt)} · kept until {when(d.expiresAt)} · {d.code}
                </span>
              </span>
              <ArrowRight className="h-4 w-4 shrink-0 text-niki-ink/35" />
            </ActionLink>
          ))}
        </div>
      ) : null}
    </div>
  );
}
