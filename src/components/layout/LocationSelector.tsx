"use client";

import { MapPin } from "lucide-react";
import { locations } from "@/lib/mock-data";
import { useLocation } from "@/components/providers/LocationProvider";
import { cn } from "@/lib/cn";

export function LocationSelector({ className }: { className?: string }) {
  const { selectedLocationId, setSelectedLocationId } = useLocation();

  return (
    <label
      className={cn(
        "flex items-center gap-1.5 rounded-full bg-white/10 px-3 py-1.5 text-sm text-white transition-colors hover:bg-white/15",
        className,
      )}
    >
      <MapPin className="h-4 w-4 shrink-0 text-niki-orange" />
      <span className="hidden whitespace-nowrap text-white/60 sm:inline">Shopping in</span>
      <select
        value={selectedLocationId}
        onChange={(e) => setSelectedLocationId(e.target.value)}
        className="max-w-[9rem] cursor-pointer bg-transparent text-sm font-semibold text-white outline-none [&>option]:text-niki-ink sm:max-w-[12rem]"
        aria-label="Choose your campus, institution, or community"
      >
        {locations.map((location) => (
          <option key={location.id} value={location.id}>
            {location.name}
          </option>
        ))}
      </select>
    </label>
  );
}
