"use client";

import { useState } from "react";
import { BadgeCheck, Check, Copy, MessageCircle } from "lucide-react";
import { renderShareMessage } from "@/lib/affiliate-policy";

/**
 * The store-wide link: the one that goes in a bio.
 *
 * Separate from the per-product links because it does a different job — it is
 * what somebody puts in their Instagram profile or their WhatsApp About, where
 * a single product would be stale by next week. Any purchase made after
 * following it is credited for the whole attribution window, whatever the
 * person ends up buying.
 */
export function ShareLinkCard({
  link,
  code,
  message,
  suspended,
}: {
  link: string;
  code: string;
  message: string;
  suspended: boolean;
}) {
  const [copied, setCopied] = useState(false);

  const text = renderShareMessage(
    message || "Shop Nickimart — genuine goods, nationwide delivery. Order with my link 👇",
    { product: "Nickimart", price: "", link },
  );

  async function copy() {
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      // The link is printed below, so it can still be copied by hand.
    }
  }

  async function share() {
    if (typeof navigator !== "undefined" && navigator.share) {
      try {
        await navigator.share({ text, title: "Shop on Nickimart", url: link });
        return;
      } catch (err) {
        if ((err as Error)?.name === "AbortError") return;
      }
    }
    window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, "_blank", "noopener");
  }

  return (
    <div className="rounded-2xl bg-niki-black p-5 text-white sm:p-6">
      <div className="flex items-center gap-2 text-white/70">
        <BadgeCheck className="h-5 w-5 text-niki-orange" />
        <span className="text-sm font-medium">Your store-wide referral link</span>
      </div>
      <p className="mt-2 break-all font-mono text-sm text-white/90">{link}</p>
      <p className="mt-1 text-xs text-white/45">
        Code <span className="font-mono font-semibold text-white/70">{code}</span> — anything the
        shopper buys after following it is credited to you.
      </p>

      <div className="mt-4 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={share}
          disabled={suspended}
          className="niki-press niki-focus inline-flex items-center gap-2 rounded-full bg-niki-orange px-4 py-2.5 text-xs font-bold text-white hover:bg-niki-orange-light disabled:opacity-50"
        >
          <MessageCircle className="h-3.5 w-3.5" />
          Share
        </button>
        <button
          type="button"
          onClick={copy}
          className="niki-press niki-focus inline-flex items-center gap-2 rounded-full px-4 py-2.5 text-xs font-bold text-white/80 ring-1 ring-white/20 hover:bg-white/10"
        >
          {copied ? (
            <>
              <Check className="h-3.5 w-3.5 text-niki-success" /> Copied
            </>
          ) : (
            <>
              <Copy className="h-3.5 w-3.5" /> Copy link
            </>
          )}
        </button>
      </div>

      {suspended ? (
        <p className="mt-3 rounded-xl bg-white/10 px-3 py-2 text-xs text-white/70">
          Sharing is paused while your account is on hold.
        </p>
      ) : null}
    </div>
  );
}
