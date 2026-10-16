"use client";

import { useState } from "react";
import { Check, Copy, MessageCircle, Users } from "lucide-react";

/**
 * The link an affiliate recruits with.
 *
 * Deliberately not the same card as the store-wide link, and not on the same
 * screen: that one sends a shopper to a product, this one sends somebody to the
 * programme. Sharing the wrong one is the mistake worth designing out, so this
 * says who it is for and what they get in the message it sends.
 */
export function RecruitLinkCard({
  link,
  code,
  pitch,
  rewards,
  paused,
}: {
  link: string;
  code: string;
  pitch: string;
  rewards: string;
  paused: boolean;
}) {
  const [copied, setCopied] = useState(false);

  const text = `${pitch}\n\n${rewards}\n\nJoin with my link 👇\n${link}`;

  async function copy() {
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      // The link is printed above, so it can still be copied by hand.
    }
  }

  async function share() {
    if (typeof navigator !== "undefined" && navigator.share) {
      try {
        await navigator.share({ text, title: "Become a Nickimart affiliate", url: link });
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
        <Users className="h-5 w-5 text-niki-orange" />
        <span className="text-sm font-medium">Your recruiting link</span>
      </div>
      <p className="mt-2 break-all font-mono text-sm text-white/90">{link}</p>
      <p className="mt-1 text-xs text-white/45">
        Code <span className="font-mono font-semibold text-white/70">{code}</span> — anybody who
        joins through it is on your team for good.
      </p>

      <div className="mt-4 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={share}
          disabled={paused}
          className="niki-press niki-focus inline-flex items-center gap-2 rounded-full bg-niki-orange px-4 py-2.5 text-xs font-bold text-white hover:bg-niki-orange-light disabled:opacity-50"
        >
          <MessageCircle className="h-3.5 w-3.5" />
          Invite someone
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

      {paused ? (
        <p className="mt-3 rounded-xl bg-white/10 px-3 py-2 text-xs text-white/70">
          Recruiting is paused at the moment.
        </p>
      ) : null}
    </div>
  );
}
