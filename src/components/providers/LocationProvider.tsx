"use client";

import { createContext, useContext, useState, type ReactNode } from "react";
import { locations } from "@/lib/mock-data";

interface LocationContextValue {
  selectedLocationId: string;
  setSelectedLocationId: (id: string) => void;
}

const LocationContext = createContext<LocationContextValue | null>(null);

export function LocationProvider({ children }: { children: ReactNode }) {
  const [selectedLocationId, setSelectedLocationId] = useState<string>("any");

  return (
    <LocationContext.Provider value={{ selectedLocationId, setSelectedLocationId }}>
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
  const { selectedLocationId } = useLocation();
  return locations.find((l) => l.id === selectedLocationId) ?? locations[0];
}
