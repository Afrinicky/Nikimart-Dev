"use client";

import { useEffect, useState } from "react";
import { Zap } from "lucide-react";

function getRemaining(target: number) {
  const diff = Math.max(0, target - Date.now());
  const hours = Math.floor(diff / 3_600_000);
  const minutes = Math.floor((diff % 3_600_000) / 60_000);
  const seconds = Math.floor((diff % 60_000) / 1_000);
  return { hours, minutes, seconds };
}

const pad = (n: number) => n.toString().padStart(2, "0");

export function CountdownTimer() {
  const [target] = useState(() => Date.now() + 1000 * 60 * 60 * 7 + 1000 * 60 * 42);
  const [remaining, setRemaining] = useState(() => getRemaining(target));

  useEffect(() => {
    const id = setInterval(() => setRemaining(getRemaining(target)), 1000);
    return () => clearInterval(id);
  }, [target]);

  return (
    <div className="flex items-center gap-2 rounded-full bg-niki-danger/10 px-3 py-1.5 text-niki-danger ring-1 ring-niki-danger/20">
      <Zap className="h-4 w-4 fill-niki-danger" />
      <span className="text-xs font-semibold">Ends in</span>
      <div className="flex items-center gap-1 font-mono text-sm font-bold">
        <span className="rounded bg-niki-danger px-1.5 py-0.5 text-white">{pad(remaining.hours)}</span>
        :
        <span className="rounded bg-niki-danger px-1.5 py-0.5 text-white">{pad(remaining.minutes)}</span>
        :
        <span className="rounded bg-niki-danger px-1.5 py-0.5 text-white">{pad(remaining.seconds)}</span>
      </div>
    </div>
  );
}
