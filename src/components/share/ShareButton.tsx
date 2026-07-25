"use client";

import { useEffect, useRef, useState } from "react";
import { Check, Copy, Send, Share2 } from "lucide-react";
import { FacebookIcon, XIcon } from "@/components/share/SocialIcons";

/**
 * Share a product or store. Builds an absolute URL from `path` on the client
 * and offers WhatsApp, Facebook, X, copy-link, and the native share sheet
 * (which covers Instagram, TikTok, etc. on mobile).
 */
export function ShareButton({
  path,
  title,
  label = "Share",
  tone = "light",
}: {
  path: string;
  title: string;
  label?: string;
  tone?: "light" | "dark";
}) {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const [url, setUrl] = useState("");
  const [canNativeShare, setCanNativeShare] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setUrl(`${window.location.origin}${path}`);
    setCanNativeShare(typeof navigator !== "undefined" && typeof navigator.share === "function");
  }, [path]);

  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [open]);

  const enc = encodeURIComponent;
  const links = [
    { key: "wa", label: "WhatsApp", icon: Send, href: `https://wa.me/?text=${enc(`${title} ${url}`)}` },
    { key: "fb", label: "Facebook", icon: FacebookIcon, href: `https://www.facebook.com/sharer/sharer.php?u=${enc(url)}` },
    { key: "x", label: "X (Twitter)", icon: XIcon, href: `https://twitter.com/intent/tweet?url=${enc(url)}&text=${enc(title)}` },
  ];

  async function copy() {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // ignore
    }
  }

  async function nativeShare() {
    try {
      await navigator.share({ title, url });
      setOpen(false);
    } catch {
      // user cancelled
    }
  }

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label="Share"
        className={
          tone === "dark"
            ? "flex items-center gap-2 rounded-full bg-white/15 px-4 py-2 text-sm font-semibold text-white ring-1 ring-white/25 transition-colors hover:bg-white/25"
            : "flex items-center gap-2 rounded-full px-4 py-2 text-sm font-semibold text-niki-ink/70 ring-1 ring-black/10 transition-colors hover:bg-white"
        }
      >
        <Share2 className={`h-4 w-4 ${tone === "dark" ? "text-white" : "text-niki-orange"}`} />
        {label}
      </button>

      {open ? (
        <div className="absolute right-0 z-30 mt-2 w-52 overflow-hidden rounded-2xl bg-white p-1.5 shadow-xl ring-1 ring-black/5">
          {canNativeShare ? (
            <button type="button" onClick={nativeShare} className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm font-medium text-niki-ink hover:bg-niki-surface">
              <Share2 className="h-4 w-4 text-niki-orange" /> Share via…
            </button>
          ) : null}
          {links.map((l) => (
            <a key={l.key} href={l.href} target="_blank" rel="noopener noreferrer" onClick={() => setOpen(false)} className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium text-niki-ink hover:bg-niki-surface">
              <l.icon className="h-4 w-4 text-niki-ink/50" /> {l.label}
            </a>
          ))}
          <button type="button" onClick={copy} className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm font-medium text-niki-ink hover:bg-niki-surface">
            {copied ? <Check className="h-4 w-4 text-niki-success" /> : <Copy className="h-4 w-4 text-niki-ink/50" />}
            {copied ? "Link copied!" : "Copy link"}
          </button>
        </div>
      ) : null}
    </div>
  );
}
