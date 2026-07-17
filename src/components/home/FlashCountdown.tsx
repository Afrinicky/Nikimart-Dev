"use client";

import { useEffect, useState } from "react";

function getRemaining(target: number) {
  const diff = Math.max(0, target - Date.now());
  return {
    hours: Math.floor(diff / 3_600_000),
    minutes: Math.floor((diff % 3_600_000) / 60_000),
    seconds: Math.floor((diff % 60_000) / 1_000),
  };
}

const pad = (n: number) => n.toString().padStart(2, "0");

/** Compact white-on-red flash-sale countdown for the Jumia-style header bar. */
export function FlashCountdown() {
  const [target] = useState(() => Date.now() + 1000 * 60 * 60 * 7 + 1000 * 60 * 42);
  const [r, setR] = useState(() => getRemaining(target));

  useEffect(() => {
    const id = setInterval(() => setR(getRemaining(target)), 1000);
    return () => clearInterval(id);
  }, [target]);

  const cell = "rounded bg-white/20 px-1.5 py-0.5 font-mono text-sm font-bold tabular-nums text-white";
  return (
    <div className="flex items-center gap-1.5 text-white">
      <span className="text-xs font-semibold text-white/90 sm:text-sm">Time left:</span>
      <div className="flex items-center gap-1">
        <span className={cell}>{pad(r.hours)}</span>
        <span className="font-bold text-white/80">:</span>
        <span className={cell}>{pad(r.minutes)}</span>
        <span className="font-bold text-white/80">:</span>
        <span className={cell}>{pad(r.seconds)}</span>
      </div>
    </div>
  );
}
