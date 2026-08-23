"use client";

import { useEffect, useRef, useState } from "react";
import { Check, Copy, Mail, Send, Share2 } from "lucide-react";
import {
  FacebookIcon,
  InstagramIcon,
  TelegramIcon,
  TiktokIcon,
  XIcon,
} from "@/components/share/SocialIcons";

/**
 * The share sheet used everywhere a link is handed out, including an
 * affiliate's referral links.
 *
 * Facebook, X, WhatsApp, Telegram and email all accept a prefilled share URL,
 * so those open straight into a composer. Instagram and TikTok have no such
 * web endpoint — you can't prefill a post from a link — so those copy the link
 * and open the app instead, which is the only flow that actually works there.
 */
export interface ShareTarget {
  key: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  /** A prefilled composer URL, or null when the platform has no such endpoint. */
  href: ((url: string, text: string) => string) | null;
  /** Where to send the user after copying, when there's no composer. */
  fallbackUrl?: string;
  hint?: string;
}

const enc = encodeURIComponent;

export const SHARE_TARGETS: ShareTarget[] = [
  { key: "whatsapp", label: "WhatsApp", icon: Send, href: (u, t) => `https://wa.me/?text=${enc(`${t} ${u}`)}` },
  { key: "facebook", label: "Facebook", icon: FacebookIcon, href: (u) => `https://www.facebook.com/sharer/sharer.php?u=${enc(u)}` },
  {
    key: "instagram",
    label: "Instagram",
    icon: InstagramIcon,
    href: null,
    fallbackUrl: "https://www.instagram.com/",
    hint: "Link copied — paste it in your story or bio",
  },
  {
    key: "tiktok",
    label: "TikTok",
    icon: TiktokIcon,
    href: null,
    fallbackUrl: "https://www.tiktok.com/upload",
    hint: "Link copied — paste it in your caption or bio",
  },
  { key: "x", label: "X (Twitter)", icon: XIcon, href: (u, t) => `https://twitter.com/intent/tweet?url=${enc(u)}&text=${enc(t)}` },
  { key: "telegram", label: "Telegram", icon: TelegramIcon, href: (u, t) => `https://t.me/share/url?url=${enc(u)}&text=${enc(t)}` },
  { key: "email", label: "Email", icon: Mail, href: (u, t) => `mailto:?subject=${enc(t)}&body=${enc(`${t}\n\n${u}`)}` },
];

export function ShareMenu({
  path,
  title,
  label = "Share",
  tone = "light",
  size = "md",
}: {
  /** Root-relative path; the absolute URL is built from the current origin. */
  path: string;
  title: string;
  label?: string;
  tone?: "light" | "dark";
  size?: "sm" | "md";
}) {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  // Resolved when the sheet opens rather than in an effect: the absolute URL
  // needs `window`, which doesn't exist during the server render.
  const [url, setUrl] = useState("");
  const [canNativeShare, setCanNativeShare] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  function toggle() {
    setOpen((wasOpen) => {
      if (!wasOpen) {
        setUrl(`${window.location.origin}${path}`);
        setCanNativeShare(typeof navigator.share === "function");
      }
      return !wasOpen;
    });
  }

  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  async function copyLink(): Promise<boolean> {
    try {
      await navigator.clipboard.writeText(url);
      return true;
    } catch {
      return false;
    }
  }

  async function onCopy() {
    if (await copyLink()) {
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    }
  }

  async function onTarget(target: ShareTarget, e: React.MouseEvent) {
    if (target.href) return; // let the anchor navigate
    e.preventDefault();
    await copyLink();
    setNote(target.hint ?? "Link copied");
    setTimeout(() => setNote(null), 2400);
    if (target.fallbackUrl) window.open(target.fallbackUrl, "_blank", "noopener,noreferrer");
  }

  async function nativeShare() {
    try {
      await navigator.share({ title, url });
      setOpen(false);
    } catch {
      // user cancelled
    }
  }

  const buttonClass =
    tone === "dark"
      ? "flex items-center gap-2 rounded-full bg-white/15 px-4 py-2 text-sm font-semibold text-white ring-1 ring-white/25 transition-colors hover:bg-white/25"
      : size === "sm"
        ? "flex items-center gap-1.5 rounded-full bg-niki-orange px-3.5 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-niki-orange-light"
        : "flex items-center gap-2 rounded-full px-4 py-2 text-sm font-semibold text-niki-ink/70 ring-1 ring-niki-edge-strong transition-colors hover:bg-white";

  return (
    <div className="relative" ref={ref}>
      <button type="button" onClick={toggle} aria-expanded={open} aria-haspopup="menu" className={buttonClass}>
        <Share2 className={size === "sm" && tone === "light" ? "h-3.5 w-3.5" : `h-4 w-4 ${tone === "dark" ? "text-white" : "text-niki-orange"}`} />
        {label}
      </button>

      {open ? (
        <div role="menu" className="absolute right-0 z-30 mt-2 w-60 overflow-hidden rounded-2xl bg-white p-1.5 shadow-xl ring-1 ring-niki-edge">
          <button type="button" onClick={onCopy} className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm font-semibold text-niki-ink hover:bg-niki-surface">
            {copied ? <Check className="h-4 w-4 text-niki-success" /> : <Copy className="h-4 w-4 text-niki-orange" />}
            {copied ? "Link copied!" : "Copy link"}
          </button>

          {canNativeShare ? (
            <button type="button" onClick={nativeShare} className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm font-medium text-niki-ink hover:bg-niki-surface">
              <Share2 className="h-4 w-4 text-niki-ink/50" /> Share via…
            </button>
          ) : null}

          <div className="my-1 border-t border-niki-edge" />

          {SHARE_TARGETS.map((t) => (
            <a
              key={t.key}
              href={t.href ? t.href(url, title) : (t.fallbackUrl ?? "#")}
              target="_blank"
              rel="noopener noreferrer"
              onClick={(e) => onTarget(t, e)}
              className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium text-niki-ink hover:bg-niki-surface"
            >
              <t.icon className="h-4 w-4 text-niki-ink/50" /> {t.label}
            </a>
          ))}

          {note ? <p className="px-3 py-2 text-xs font-medium text-niki-success">{note}</p> : null}
        </div>
      ) : null}
    </div>
  );
}
