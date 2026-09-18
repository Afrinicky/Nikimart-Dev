"use client";

import { useEffect, useState } from "react";
import { Check, Copy, ImageDown, Share2, Tags, UserPlus, Users } from "lucide-react";
import { ActionLink } from "@/components/ui/motion";
import { cn } from "@/lib/cn";

/**
 * The four things an agent reaches for constantly, and the three they are
 * always being asked to send.
 *
 * It sits at the top of the dashboard because it is what people log in to do:
 * send somebody their store link, read out their code, price a bundle, bring
 * somebody in. Every one of those was two or three screens away before.
 *
 * One card, not six — a row of tappable values and a row of destinations, so
 * it reads as part of the dashboard rather than a toolbar bolted above it.
 */

function useCopied(): [string | null, (key: string, value: string) => void] {
  const [copied, setCopied] = useState<string | null>(null);

  useEffect(() => {
    if (!copied) return;
    const t = setTimeout(() => setCopied(null), 1600);
    return () => clearTimeout(t);
  }, [copied]);

  return [
    copied,
    async (key, value) => {
      try {
        await navigator.clipboard.writeText(value);
        setCopied(key);
      } catch {
        // Clipboard blocked — the value is on screen to select by hand.
      }
    },
  ];
}

function ValueChip({
  label,
  display,
  copied,
  onCopy,
  onShare,
}: {
  label: string;
  display: string;
  copied: boolean;
  onCopy: () => void;
  onShare?: () => void;
}) {
  return (
    <div className="flex min-w-0 items-center gap-2 rounded-xl bg-niki-surface px-3 py-2.5">
      <div className="min-w-0 flex-1">
        <p className="text-[10px] font-semibold uppercase tracking-wide text-niki-ink/45">
          {label}
        </p>
        <p className="truncate font-mono text-xs font-semibold text-niki-ink">{display}</p>
      </div>
      {onShare ? (
        <button
          type="button"
          onClick={onShare}
          aria-label={`Share ${label}`}
          className="niki-press niki-focus rounded-lg p-1.5 text-niki-ink/45 hover:bg-white hover:text-niki-ink"
        >
          <Share2 className="h-3.5 w-3.5" />
        </button>
      ) : null}
      <button
        type="button"
        onClick={onCopy}
        aria-label={`Copy ${label}`}
        className={cn(
          "niki-press niki-focus rounded-lg p-1.5 transition-colors",
          copied ? "text-niki-success" : "text-niki-ink/45 hover:bg-white hover:text-niki-ink",
        )}
      >
        {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
      </button>
    </div>
  );
}

function Shortcut({
  href,
  label,
  icon: Icon,
  tour,
}: {
  href: string;
  label: string;
  icon: React.ElementType;
  tour?: string;
}) {
  return (
    <ActionLink
      href={href}
      data-tour={tour}
      className="flex flex-col items-center gap-1.5 rounded-xl bg-niki-surface px-2 py-3 text-center text-[11px] font-semibold text-niki-ink/75 transition-colors hover:bg-niki-orange/10 hover:text-niki-orange sm:text-xs"
    >
      <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-white text-niki-orange ring-1 ring-niki-edge">
        <Icon className="h-4 w-4" />
      </span>
      {label}
    </ActionLink>
  );
}

export function QuickActions({
  storeLink,
  code,
  referralLink,
  storeName,
}: {
  storeLink: string;
  code: string;
  referralLink: string;
  storeName: string;
}) {
  const [copied, copy] = useCopied();

  async function share(title: string, url: string, key: string) {
    if (typeof navigator !== "undefined" && navigator.share) {
      try {
        await navigator.share({ title, url });
        return;
      } catch {
        // Cancelled or unsupported — copying is the honest fallback.
      }
    }
    copy(key, url);
  }

  // The scheme is noise on a chip somebody is reading off a phone.
  const bare = (url: string) => url.replace(/^https?:\/\//, "");

  return (
    <section className="rounded-2xl bg-white p-4 ring-1 ring-niki-edge sm:p-5">
      <div className="grid gap-2 sm:grid-cols-3">
        <ValueChip
          label="Store link"
          display={bare(storeLink)}
          copied={copied === "store"}
          onCopy={() => copy("store", storeLink)}
          onShare={() => share(`${storeName} — buy data`, storeLink, "store")}
        />
        <ValueChip
          label="Agent code"
          display={code}
          copied={copied === "code"}
          onCopy={() => copy("code", code)}
        />
        <ValueChip
          label="Referral link"
          display={bare(referralLink)}
          copied={copied === "referral"}
          onCopy={() => copy("referral", referralLink)}
          onShare={() => share("Become a Nickimart agent", referralLink, "referral")}
        />
      </div>

      <div className="mt-2 grid grid-cols-4 gap-2">
        <Shortcut href="/agent/store?tab=pricing" label="Set prices" icon={Tags} tour="set-prices" />
        <Shortcut href="/agent/team/new" label="Add agent" icon={UserPlus} />
        <Shortcut href="/agent/team" label="My team" icon={Users} />
        <Shortcut href="/agent/store?tab=flyer" label="Flyer" icon={ImageDown} />
      </div>
    </section>
  );
}
