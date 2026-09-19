"use client";

import { useSyncExternalStore } from "react";
import {
  ArrowRight,
  Banknote,
  BadgeCheck,
  Megaphone,
  ShieldCheck,
  TrendingUp,
  TriangleAlert,
  Users,
  X,
} from "lucide-react";
import { ActionLink } from "@/components/ui/motion";
import { dismissedAlerts } from "@/components/agent/alerts-dismissed";
import { cn } from "@/lib/cn";

/**
 * The strip at the top of the dashboard: things worth a moment before the
 * numbers.
 *
 * Built as a strip rather than as one banner because there will be more of
 * these — a payout to chase, a price left unset, a team invitation. An alert is
 * a value the page hands over, so adding one later is a row in a list rather
 * than a component nobody can find.
 *
 * Icons are named rather than passed: a component is a function, and a function
 * cannot cross from a server component into a client one. A name is a string,
 * and strings travel.
 */

const ICONS = {
  shield: ShieldCheck,
  warning: TriangleAlert,
  money: Banknote,
  team: Users,
  sales: TrendingUp,
  verified: BadgeCheck,
  megaphone: Megaphone,
} as const;

export type AlertIcon = keyof typeof ICONS;

export interface AgentAlert {
  /** Stable across loads — it is also what dismissal remembers. */
  key: string;
  tone: "info" | "warn" | "success" | "danger";
  icon: AlertIcon;
  title: string;
  body?: string;
  href?: string;
  /** The words on the button. Defaults to a plain arrow when omitted. */
  cta?: string;
  /** False for anything that must not be waved away. Defaults to true. */
  dismissible?: boolean;
}

const TONES = {
  info: {
    card: "bg-niki-trust/[0.07] ring-niki-trust/20",
    chip: "bg-niki-trust/15 text-niki-trust",
    cta: "bg-niki-trust text-white hover:bg-niki-trust/90",
  },
  warn: {
    card: "bg-amber-50 ring-amber-200",
    chip: "bg-amber-500/20 text-amber-700",
    cta: "bg-amber-600 text-white hover:bg-amber-700",
  },
  success: {
    card: "bg-niki-success/[0.07] ring-niki-success/20",
    chip: "bg-niki-success/15 text-niki-success",
    cta: "bg-niki-success text-white hover:bg-niki-success/90",
  },
  danger: {
    card: "bg-niki-danger/[0.07] ring-niki-danger/20",
    chip: "bg-niki-danger/15 text-niki-danger",
    cta: "bg-niki-danger text-white hover:bg-niki-danger/90",
  },
} as const;

export function AgentAlerts({ alerts }: { alerts: AgentAlert[] }) {
  const dismissed = useSyncExternalStore(
    dismissedAlerts.subscribe,
    dismissedAlerts.get,
    dismissedAlerts.empty,
  );
  const showing = alerts.filter((a) => a.dismissible === false || !dismissed.includes(a.key));
  if (showing.length === 0) return null;

  return (
    <ul className="space-y-2">
      {showing.map((a) => {
        const Icon = ICONS[a.icon];
        const tone = TONES[a.tone];
        return (
          <li
            key={a.key}
            className={cn(
              "animate-fade-up flex flex-wrap items-center gap-3 rounded-2xl px-4 py-3 ring-1",
              tone.card,
            )}
          >
            <span
              className={cn(
                "flex h-9 w-9 shrink-0 items-center justify-center rounded-xl",
                tone.chip,
              )}
            >
              <Icon className="h-4 w-4" />
            </span>

            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-niki-ink">{a.title}</p>
              {a.body ? <p className="mt-0.5 text-xs text-niki-ink/60">{a.body}</p> : null}
            </div>

            {a.href ? (
              <ActionLink
                href={a.href}
                className={cn(
                  "niki-press niki-focus flex shrink-0 items-center gap-1.5 rounded-xl px-4 py-2 text-xs font-bold transition-colors",
                  tone.cta,
                )}
              >
                {a.cta ?? "Open"}
                <ArrowRight className="h-3.5 w-3.5" />
              </ActionLink>
            ) : null}

            {a.dismissible === false ? null : (
              <button
                type="button"
                onClick={() => dismissedAlerts.dismiss(a.key)}
                aria-label="Dismiss"
                className="niki-press niki-focus shrink-0 rounded-lg p-1.5 text-niki-ink/35 transition-colors hover:bg-niki-black/5 hover:text-niki-ink"
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </li>
        );
      })}
    </ul>
  );
}
