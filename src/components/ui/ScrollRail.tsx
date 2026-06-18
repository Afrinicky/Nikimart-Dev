import type { ReactNode } from "react";

export function ScrollRail({ children }: { children: ReactNode }) {
  return (
    <div className="scrollbar-none flex snap-x snap-mandatory gap-4 overflow-x-auto pb-2">
      {children}
    </div>
  );
}

export function RailItem({ children }: { children: ReactNode }) {
  return (
    <div className="w-[42%] shrink-0 snap-start sm:w-[220px] lg:w-[230px]">
      {children}
    </div>
  );
}
