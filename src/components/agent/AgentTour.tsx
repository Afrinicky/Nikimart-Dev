"use client";

import { useCallback, useEffect, useState, useSyncExternalStore } from "react";
import { ArrowRight, Check, Compass, X } from "lucide-react";
import { overlayBusy } from "@/components/agent/overlay-busy";
import { cn } from "@/lib/cn";

/**
 * The first five minutes, for somebody who has never sold data online.
 *
 * A new agent lands on a console with ten screens and no idea which one earns
 * them money. This walks them through the four that do — where their links
 * live, where prices are set, where a sale is made, where a team is built —
 * by pointing at the real thing on the real page rather than describing it in
 * a paragraph nobody reads.
 *
 * Skippable at every step, and remembered once finished or skipped: a tour
 * that reappears is a tour people learn to dismiss without looking.
 */

interface Step {
  /** The `data-tour` value to point at. Absent means a plain centred card. */
  target?: string;
  title: string;
  body: string;
}

const STEPS: Step[] = [
  {
    title: "Welcome to your store",
    body: "Four quick things and you're selling. It takes a minute — skip any time.",
  },
  {
    target: "quick-actions",
    title: "Your links live here",
    body: "Your store link, agent code and referral link. Tap to copy, then send to customers on WhatsApp.",
  },
  {
    target: "set-prices",
    title: "Set your own prices",
    body: "You buy at the agent price and charge what you like. The difference is yours, paid once the bundle is delivered.",
  },
  {
    target: "topup",
    title: "Sell to a walk-in",
    body: "Pick a bundle, enter the number, pay from your wallet or by card. It's sent in seconds.",
  },
  {
    target: "nav-team",
    title: "Build your team",
    body: "Recruit other agents and earn from what they sell. You can register them here yourself.",
  },
];

/** The first match that is actually on screen — the nav exists twice on a phone. */
function visibleTarget(name: string): HTMLElement | null {
  const nodes = Array.from(
    document.querySelectorAll<HTMLElement>(`[data-tour="${name}"]`),
  );
  return nodes.find((n) => n.getBoundingClientRect().width > 0) ?? null;
}

interface Rect {
  top: number;
  left: number;
  width: number;
  height: number;
}

export function AgentTour({ agentId, autoStart }: { agentId: string; autoStart: boolean }) {
  const storageKey = `niki-agent-tour:${agentId}`;
  const [step, setStep] = useState<number | null>(null);
  const [rect, setRect] = useState<Rect | null>(null);

  // An announcement gets the screen first: a tour drawn over a notice somebody
  // has to acknowledge makes the notice unclickable.
  const busy = useSyncExternalStore(overlayBusy.subscribe, overlayBusy.get, overlayBusy.none);

  // Start only for somebody who has never been through it, and only once the
  // page has actually laid out — a spotlight drawn before that lands nowhere.
  useEffect(() => {
    if (!autoStart || busy) return;
    let seen = true;
    try {
      seen = window.localStorage.getItem(storageKey) === "done";
    } catch {
      seen = true; // storage blocked: never nag
    }
    if (seen) return;
    const t = setTimeout(() => setStep(0), 700);
    return () => clearTimeout(t);
  }, [autoStart, busy, storageKey]);

  const finish = useCallback(() => {
    setStep(null);
    setRect(null);
    try {
      window.localStorage.setItem(storageKey, "done");
    } catch {
      // Nothing to do; the tour simply may run again.
    }
  }, [storageKey]);

  // Follow the current step's target: scroll it into view, then track where it
  // ended up — through the scroll, and through a resize or rotation after.
  //
  // Every measurement happens inside a frame callback rather than in the effect
  // body: a spotlight measured during the effect is measured before the browser
  // has laid the page out, and setting state there costs a second render pass
  // for a number that was wrong anyway.
  useEffect(() => {
    if (step === null) return;
    const target = STEPS[step]?.target;
    const node = target ? visibleTarget(target) : null;
    if (node) node.scrollIntoView({ behavior: "smooth", block: "center" });

    const measure = () => {
      if (!node) {
        setRect(null);
        return;
      }
      const r = node.getBoundingClientRect();
      setRect({ top: r.top, left: r.left, width: r.width, height: r.height });
    };

    let frame = window.requestAnimationFrame(function tick() {
      measure();
      frame = window.requestAnimationFrame(tick);
    });
    // The frame loop only has to outlast the smooth scroll; events cover the rest.
    const stop = setTimeout(() => window.cancelAnimationFrame(frame), 900);
    window.addEventListener("resize", measure);
    window.addEventListener("scroll", measure, { passive: true });
    return () => {
      window.cancelAnimationFrame(frame);
      clearTimeout(stop);
      window.removeEventListener("resize", measure);
      window.removeEventListener("scroll", measure);
    };
  }, [step]);

  if (step === null) return null;

  const current = STEPS[step];
  const last = step === STEPS.length - 1;

  return (
    <div className="fixed inset-0 z-[70]" role="dialog" aria-modal="true" aria-label="Walkthrough">
      {/* The dim. Clicking it skips, exactly as the X does. */}
      <button
        type="button"
        aria-label="Skip walkthrough"
        onClick={finish}
        className="animate-fade-in absolute inset-0 h-full w-full bg-niki-black/70"
      />

      {/* The spotlight: a ring around the real control, not a picture of one. */}
      {rect ? (
        <div
          aria-hidden
          className="pointer-events-none absolute rounded-2xl ring-4 ring-niki-orange transition-all duration-200"
          style={{
            top: rect.top - 6,
            left: rect.left - 6,
            width: rect.width + 12,
            height: rect.height + 12,
            boxShadow: "0 0 0 9999px rgba(16,16,16,0.55)",
          }}
        />
      ) : null}

      {/* The card. Bottom sheet on a phone, bottom-centred on a desktop — one
          place to look, wherever the highlight happens to be. */}
      <div className="animate-sheet-up absolute inset-x-0 bottom-0 z-10 p-3 pb-[max(env(safe-area-inset-bottom),0.75rem)] sm:left-1/2 sm:w-[26rem] sm:-translate-x-1/2 sm:pb-6">
        <div className="rounded-2xl bg-white p-5 shadow-2xl">
          <div className="flex items-start gap-3">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-niki-orange/10 text-niki-orange">
              <Compass className="h-4.5 w-4.5" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="font-display font-bold text-niki-ink">{current.title}</p>
              <p className="mt-1 text-sm leading-relaxed text-niki-ink/65">{current.body}</p>
            </div>
            <button
              type="button"
              onClick={finish}
              aria-label="Skip walkthrough"
              className="niki-press niki-focus rounded-lg p-1.5 text-niki-ink/35 hover:bg-niki-surface hover:text-niki-ink"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          <div className="mt-4 flex items-center justify-between gap-3">
            <div className="flex gap-1.5" aria-hidden>
              {STEPS.map((s, i) => (
                <span
                  key={s.title}
                  className={cn(
                    "h-1.5 rounded-full transition-all",
                    i === step ? "w-5 bg-niki-orange" : "w-1.5 bg-niki-ink/15",
                  )}
                />
              ))}
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={finish}
                className="niki-press niki-focus rounded-lg px-3 py-2 text-xs font-semibold text-niki-ink/50 hover:text-niki-ink"
              >
                Skip
              </button>
              <button
                type="button"
                onClick={() => (last ? finish() : setStep(step + 1))}
                className="niki-press niki-focus flex items-center gap-1.5 rounded-xl bg-niki-black px-4 py-2.5 text-sm font-bold text-white"
              >
                {last ? "Start selling" : "Next"}
                {last ? <Check className="h-4 w-4" /> : <ArrowRight className="h-4 w-4" />}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
