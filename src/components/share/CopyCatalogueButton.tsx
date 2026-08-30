"use client";

import { useState } from "react";
import { Check, ClipboardList } from "lucide-react";

/**
 * Copies a ready-made catalogue (product names + links) to the clipboard so the
 * seller/affiliate can paste it straight into a WhatsApp chat or status.
 */
export function CopyCatalogueButton({
  text,
  label = "Copy catalogue",
  tone = "light",
}: {
  text: string;
  label?: string;
  tone?: "light" | "dark";
}) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      // ignore
    }
  }

  const base =
    tone === "dark"
      ? "bg-white/10 text-white hover:bg-white/20"
      : "bg-niki-black/5 text-niki-ink hover:bg-niki-black/10";

  return (
    <button
      type="button"
      onClick={copy}
      className={`inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-semibold transition-colors ${base}`}
    >
      {copied ? <Check className="h-4 w-4 text-niki-success" /> : <ClipboardList className="h-4 w-4" />}
      {copied ? "Copied!" : label}
    </button>
  );
}
