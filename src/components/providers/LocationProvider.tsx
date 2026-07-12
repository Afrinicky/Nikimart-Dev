"use client";

import { createContext, useContext, useState, type ReactNode } from "react";
import type { Location } from "@/lib/types";

interface LocationContextValue {
  locations: Location[];
  selectedLocationId: string;
  setSelectedLocationId: (id: string) => void;
}

const LocationContext = createContext<LocationContextValue | null>(null);

export function LocationProvider({
  children,
  locations,
}: {
  children: ReactNode;
  locations: Location[];
}) {
  const [selectedLocationId, setSelectedLocationId] = useState<string>("any");

  return (
    <LocationContext.Provider value={{ locations, selectedLocationId, setSelectedLocationId }}>
      {children}
    </LocationContext.Provider>
  );
}

export function useLocation() {
  const ctx = useContext(LocationContext);
  if (!ctx) {
    throw new Error("useLocation must be used within a LocationProvider");
  }
  return ctx;
}

export function useSelectedLocation() {
  const { locations, selectedLocationId } = useLocation();
  return locations.find((l) => l.id === selectedLocationId) ?? locations[0];
}
