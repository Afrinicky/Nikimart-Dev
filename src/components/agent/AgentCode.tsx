"use client";

import { useEffect, useState } from "react";
import { Check, Copy } from "lucide-react";
import { cn } from "@/lib/cn";

/**
 * The agent's code with a copy button. The tick that replaces the icon is the
 * whole point — a copy that gives no sign it happened reads as a dead button.
 */
export function CopyChip({
  label,
  value,
  className,
  valueClassName,
  hideValue = false,
}: {
  label?: string;
  value: string;
  className?: string;
  valueClassName?: string;
  /** For values too long to sit in a chip — the label alone, still copying. */
  hideValue?: boolean;
}) {
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!copied) return;
    const t = setTimeout(() => setCopied(false), 1800);
    return () => clearTimeout(t);
  }, [copied]);

  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
    } catch {
      // Clipboard blocked (insecure context, permission denied) — leave the
      // value on screen for the user to select by hand.
    }
  }

  return (
    <button
      type="button"
      onClick={copy}
      aria-label={`Copy ${label ?? "value"}`}
      className={cn(
        "niki-press niki-focus flex items-center gap-2 rounded-full px-3 py-2 text-xs font-semibold",
        className,
      )}
    >
      {label ? <span className={hideValue ? undefined : "opacity-60"}>{label}</span> : null}
      {hideValue ? null : <span className={cn("font-mono", valueClassName)}>{value}</span>}
      {/* When the label already says "copy", the trailing word would say it
          twice — the icon alone carries it, and the tick still confirms. */}
      <span className="flex items-center gap-1 opacity-80">
        {copied ? (
          <>
            <Check className="animate-scale-in h-3.5 w-3.5 text-niki-success" />
            {hideValue ? null : "Copied"}
          </>
        ) : (
          <>
            <Copy className="h-3.5 w-3.5" />
            {hideValue ? null : "Copy"}
          </>
        )}
      </span>
    </button>
  );
}

export function AgentCode({ code }: { code: string }) {
  return (
    <CopyChip
      label="Agent code"
      value={code}
      className="bg-white/10 text-white ring-1 ring-white/15 hover:bg-white/20"
    />
  );
}
