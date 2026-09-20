"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { MessageSquarePlus, Search } from "lucide-react";
import { openDirect } from "@/lib/chat/actions";
import { cn } from "@/lib/cn";

/**
 * Start a one-to-one, or go back to the one that already exists.
 *
 * Searching rather than a dropdown: a network of three hundred agents is a
 * list nobody scrolls, and the name or the code is what somebody has in mind.
 */
export function StartDirect({
  people,
  basePath,
}: {
  people: { key: string; name: string; hint: string }[];
  basePath: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const term = query.trim().toLowerCase();
  const found = term
    ? people
        .filter(
          (p) => p.name.toLowerCase().includes(term) || p.hint.toLowerCase().includes(term),
        )
        .slice(0, 8)
    : [];

  function go(key: string) {
    start(async () => {
      const result = await openDirect(key);
      if (result.ok && result.id) {
        router.push(`${basePath}/${result.id}`);
        return;
      }
      setError(result.error ?? "Couldn't open that conversation.");
    });
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="niki-press niki-focus flex items-center gap-1.5 rounded-xl bg-niki-orange px-4 py-2.5 text-sm font-semibold text-white hover:bg-niki-orange-light"
      >
        <MessageSquarePlus className="h-4 w-4" />
        New message
      </button>
    );
  }

  return (
    <div className="animate-fade-up rounded-2xl bg-white p-4 ring-1 ring-niki-edge">
      <div className="relative">
        <Search className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-niki-ink/35" />
        <input
          autoFocus
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setError(null);
          }}
          placeholder="Search by name or agent code…"
          aria-label="Search people"
          className="w-full rounded-xl border border-niki-edge-strong bg-niki-surface py-2.5 pl-10 pr-4 text-sm outline-none focus:border-niki-orange focus:bg-white focus:ring-2 focus:ring-niki-orange/20"
        />
      </div>

      {found.length > 0 ? (
        <ul className="mt-2 space-y-1">
          {found.map((p) => (
            <li key={p.key}>
              <button
                type="button"
                disabled={pending}
                onClick={() => go(p.key)}
                className={cn(
                  "niki-focus flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition-colors hover:bg-niki-surface",
                  pending && "opacity-60",
                )}
              >
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-niki-black text-xs font-bold text-niki-orange">
                  {p.name.slice(0, 1).toUpperCase()}
                </span>
                <span className="min-w-0 flex-1 truncate text-sm font-medium text-niki-ink">
                  {p.name}
                </span>
                <span className="shrink-0 font-mono text-[11px] text-niki-ink/40">{p.hint}</span>
              </button>
            </li>
          ))}
        </ul>
      ) : term ? (
        <p className="mt-3 px-1 text-sm text-niki-ink/50">Nobody matches that.</p>
      ) : null}

      {error ? <p className="mt-3 px-1 text-sm text-niki-danger">{error}</p> : null}

      <button
        type="button"
        onClick={() => setOpen(false)}
        className="niki-focus mt-3 text-xs font-semibold text-niki-ink/50 hover:text-niki-ink"
      >
        Cancel
      </button>
    </div>
  );
}
