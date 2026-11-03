"use client";

import { useState, useTransition } from "react";
import { Eye, EyeOff, Share2 } from "lucide-react";
import { ActionLink } from "@/components/ui/motion";
import { setServiceVisible } from "@/lib/data-bundles/service-agent-actions";
import { formatPrice } from "@/lib/format";
import { cn } from "@/lib/cn";

/**
 * The services an agent can put on their storefront.
 *
 * One card each, and one decision per card: is this on my store or not. The
 * card itself answers the question somebody is actually asking before they
 * decide — what does it cost, and what do I make on it — so the toggle is a
 * judgement rather than a guess.
 */

export interface ShelfItem {
  id: string;
  slug: string;
  name: string;
  tagline: string;
  icon: string;
  imageUrl: string;
  accentFrom: string;
  accentTo: string;
  visible: boolean;
  fromPrice: number;
  /** The best margin across this service's options, at this agent's prices. */
  bestCommission: number;
  options: number;
}

function ShelfCard({ item }: { item: ShelfItem }) {
  const [visible, setVisible] = useState(item.visible);
  const [pending, start] = useTransition();

  function toggle() {
    const next = !visible;
    setVisible(next); // optimistic: the switch has to feel like a switch
    const fd = new FormData();
    fd.set("serviceId", item.id);
    fd.set("visible", next ? "1" : "0");
    start(async () => {
      try {
        await setServiceVisible(fd);
      } catch {
        setVisible(!next);
      }
    });
  }

  return (
    <article
      className={cn(
        "overflow-hidden rounded-2xl bg-white ring-1 ring-niki-edge transition-opacity",
        !visible && "opacity-70",
      )}
    >
      <div className="flex items-start gap-3 p-4">
        <span
          className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-xl text-xl"
          style={{ background: `linear-gradient(135deg, ${item.accentFrom}, ${item.accentTo})` }}
        >
          {item.imageUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={item.imageUrl} alt="" className="h-full w-full object-cover" />
          ) : (
            item.icon
          )}
        </span>
        <div className="min-w-0 flex-1">
          <h3 className="font-display font-bold text-niki-ink">{item.name}</h3>
          <p className="mt-0.5 line-clamp-2 text-xs text-niki-ink/55">{item.tagline}</p>
        </div>
      </div>

      <dl className="grid grid-cols-3 gap-2 border-t border-niki-edge bg-niki-surface/60 px-4 py-3 text-sm">
        <div>
          <dt className="text-[11px] font-medium text-niki-ink/45">From</dt>
          <dd className="font-figures font-bold text-niki-ink">{formatPrice(item.fromPrice)}</dd>
        </div>
        <div>
          <dt className="text-[11px] font-medium text-niki-ink/45">You earn up to</dt>
          <dd className="font-figures font-bold text-niki-success">
            {formatPrice(item.bestCommission)}
          </dd>
        </div>
        <div>
          <dt className="text-[11px] font-medium text-niki-ink/45">Options</dt>
          <dd className="font-figures font-bold text-niki-ink">{item.options}</dd>
        </div>
      </dl>

      <div className="flex items-center gap-2 border-t border-niki-edge px-4 py-3">
        <button
          type="button"
          onClick={toggle}
          disabled={pending}
          aria-pressed={visible}
          className={cn(
            "niki-press flex items-center gap-1.5 rounded-lg px-3.5 py-2 text-xs font-semibold disabled:opacity-60",
            visible
              ? "bg-niki-success/10 text-niki-success"
              : "bg-niki-surface text-niki-ink/55 hover:bg-niki-black/5",
          )}
        >
          {visible ? <Eye className="h-3.5 w-3.5" /> : <EyeOff className="h-3.5 w-3.5" />}
          {visible ? "On my store" : "Hidden"}
        </button>

        <ActionLink
          href={`/agent/products/${item.slug}`}
          className="niki-press ml-auto flex items-center gap-1.5 rounded-lg bg-niki-black px-3.5 py-2 text-xs font-semibold text-white"
        >
          <Share2 className="h-3.5 w-3.5" />
          Share
        </ActionLink>
      </div>
    </article>
  );
}

export function ServiceShelf({ items }: { items: ShelfItem[] }) {
  if (items.length === 0) {
    return (
      <p className="rounded-2xl bg-white p-8 text-center text-sm text-niki-ink/55 ring-1 ring-niki-edge">
        Nothing to sell yet. Services appear here as soon as Nickimart lists one.
      </p>
    );
  }

  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
      {items.map((item) => (
        <ShelfCard key={item.id} item={item} />
      ))}
    </div>
  );
}
