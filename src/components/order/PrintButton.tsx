"use client";

import { Printer } from "lucide-react";

export function PrintButton({ label = "Print / Save PDF" }: { label?: string }) {
  return (
    <button
      type="button"
      onClick={() => window.print()}
      className="no-print flex items-center gap-2 rounded-full bg-niki-navy px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-niki-navy-light"
    >
      <Printer className="h-4 w-4 text-niki-orange" />
      {label}
    </button>
  );
}
