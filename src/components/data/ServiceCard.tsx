"use client";

import { ArrowRight, Clock3 } from "lucide-react";
import { ActionLink } from "@/components/ui/motion";
import { formatMoney } from "@/lib/format";

/**
 * One service, as a card.
 *
 * Deliberately the bundle card's object: a coloured band carrying the name, a
 * white middle holding the two numbers somebody is weighing, and an action bar
 * in the same colour so the whole thing reads as one coloured card. A buyer
 * moving from the MTN tab to the Services tab should recognise what they are
 * looking at before they read a word of it.
 *
 * What differs is what the two numbers are. A bundle weighs data against
 * price; a service weighs price against how long it takes — which is the
 * question people actually ask at the counter.
 */
export interface StoreService {
  slug: string;
  name: string;
  tagline: string;
  icon: string;
  imageUrl: string;
  accentFrom: string;
  accentTo: string;
  fromPrice: number;
  /** True when more than one option, so the price is a starting point. */
  from: boolean;
  turnaround: string;
  options: number;
}

export function ServiceCard({ service, href }: { service: StoreService; href: string }) {
  const band = `linear-gradient(135deg, ${service.accentFrom}, ${service.accentTo})`;

  return (
    <ActionLink
      href={href}
      className="group niki-press niki-lift niki-focus flex w-full flex-col overflow-hidden rounded-2xl bg-white text-left shadow-sm ring-1 ring-niki-edge hover:shadow-xl"
    >
      {/* Colour band — the service's identity, and most of the card's weight. */}
      <div className="flex items-center justify-between gap-2 px-4 py-3.5" style={{ background: band }}>
        <span className="min-w-0 truncate font-display text-sm font-bold text-white">
          {service.name}
        </span>
        <span className="flex h-7 w-7 shrink-0 items-center justify-center overflow-hidden rounded-md bg-white/20 text-sm">
          {service.imageUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={service.imageUrl} alt="" className="h-full w-full object-cover" />
          ) : (
            service.icon
          )}
        </span>
      </div>

      {/* The two numbers, given equal room and a rule between them. */}
      <div className="grid flex-1 grid-cols-2 divide-x divide-niki-edge-strong">
        <div className="px-4 py-3.5">
          <p className="text-[11px] font-medium text-niki-ink/45">
            {service.from ? "From" : "Fee"}
          </p>
          <p className="mt-0.5 font-figures text-lg font-bold text-niki-ink sm:text-xl">
            {formatMoney(service.fromPrice)}
          </p>
        </div>
        <div className="px-4 py-3.5">
          <p className="text-[11px] font-medium text-niki-ink/45">Turnaround</p>
          <p className="mt-0.5 flex items-center gap-1 font-figures text-sm font-bold text-niki-ink">
            <Clock3 className="h-3.5 w-3.5 text-niki-ink/35" />
            {service.turnaround || "On request"}
          </p>
        </div>
      </div>

      {service.tagline ? (
        <p className="line-clamp-2 border-t border-niki-edge px-4 py-2 text-[11px] text-niki-ink/55">
          {service.tagline}
        </p>
      ) : null}

      <div
        className="flex items-center justify-center gap-1.5 px-4 py-2.5 text-xs font-bold text-white"
        style={{ background: band }}
      >
        Apply now
        <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />
      </div>
    </ActionLink>
  );
}
