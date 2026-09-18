"use client";

import { useState } from "react";
import { cn } from "@/lib/cn";

/**
 * One agent, in one window.
 *
 * Everything about an agent used to be poured down a single page: a column of
 * unrelated forms — adjust the balance, reconcile a top-up, the registration
 * breakdown, referral terms, the referrer, account details, delete — stacked
 * under the orders and the ledger with nothing to say which belonged with
 * which. It read as a pile, and finding anything meant scrolling past all of
 * it.
 *
 * So the same content is grouped by the question it answers — how are they
 * doing, what is in their wallet, who do they recruit, what is the account —
 * and only one group is on screen at a time. The sections are rendered on the
 * server and handed in; this only decides which one shows, so nothing about
 * the data crosses into the browser to make a tab strip work.
 */

export interface AgentWindowSection {
  key: string;
  label: string;
  /** A number worth seeing before you open it, e.g. pending top-ups. */
  badge?: number;
  content: React.ReactNode;
}

export function AgentWindow({ sections }: { sections: AgentWindowSection[] }) {
  const [active, setActive] = useState(sections[0]?.key ?? "");
  const current = sections.find((s) => s.key === active) ?? sections[0];

  return (
    <div className="mt-6">
      <nav className="scrollbar-none -mx-1 flex gap-1 overflow-x-auto border-b border-niki-edge px-1">
        {sections.map((s) => {
          const on = s.key === current?.key;
          return (
            <button
              key={s.key}
              type="button"
              onClick={() => setActive(s.key)}
              aria-current={on ? "page" : undefined}
              className={cn(
                "niki-focus flex shrink-0 items-center gap-2 border-b-2 px-3.5 py-3 text-sm font-semibold transition-colors",
                on
                  ? "border-niki-orange text-niki-orange"
                  : "border-transparent text-niki-ink/55 hover:text-niki-ink",
              )}
            >
              {s.label}
              {s.badge ? (
                <span
                  className={cn(
                    "rounded-md px-1.5 py-0.5 text-[10px] font-bold",
                    on ? "bg-niki-orange text-white" : "bg-niki-ink/10 text-niki-ink/60",
                  )}
                >
                  {s.badge}
                </span>
              ) : null}
            </button>
          );
        })}
      </nav>

      {/* Every section stays mounted: they are server-rendered already, and
          swapping them in and out would throw away half-typed forms. */}
      {sections.map((s) => (
        <div key={s.key} hidden={s.key !== current?.key} className="pt-5">
          {s.content}
        </div>
      ))}
    </div>
  );
}
