"use client";

import { MapPin } from "lucide-react";
import { useLocation } from "@/components/providers/LocationProvider";
import { cn } from "@/lib/cn";

export function LocationSelector({ className }: { className?: string }) {
  const { locations, selectedLocationId, setSelectedLocationId } = useLocation();

  return (
    <label
      className={cn(
        "flex items-center gap-1.5 rounded-full bg-niki-ink/[0.04] px-3 py-1.5 text-sm text-niki-ink ring-1 ring-niki-edge transition-colors hover:bg-niki-ink/[0.07]",
        className,
      )}
    >
      <MapPin className="h-4 w-4 shrink-0 text-niki-orange" />
      <select
        value={selectedLocationId}
        onChange={(e) => setSelectedLocationId(e.target.value)}
        className="max-w-[7.5rem] cursor-pointer bg-transparent text-sm font-semibold text-niki-ink outline-none xl:max-w-[10rem]"
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
