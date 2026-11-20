import { useState, useEffect, useCallback } from "react";

const STORAGE_KEY = "selected_location_id";

function getStoredLocation(): string {
  try {
    return localStorage.getItem(STORAGE_KEY) || "all";
  } catch {
    return "all";
  }
}

type Listener = (locationId: string) => void;
const listeners = new Set<Listener>();
let currentLocation = getStoredLocation();

function setGlobalLocation(locationId: string) {
  currentLocation = locationId;
  try {
    localStorage.setItem(STORAGE_KEY, locationId);
  } catch {}
  listeners.forEach(fn => fn(locationId));
}

export function useLocationFilter() {
  const [locationId, setLocationId] = useState<string>(currentLocation);

  useEffect(() => {
    const listener: Listener = (id) => setLocationId(id);
    listeners.add(listener);
    return () => { listeners.delete(listener); };
  }, []);

  const setLocation = useCallback((id: string) => {
    setGlobalLocation(id);
  }, []);

  return { locationId, setLocation };
}
