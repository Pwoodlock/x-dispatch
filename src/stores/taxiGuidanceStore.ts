/**
 * Taxi Guidance Store
 * The planned taxi routes the pilot is guided along, one per direction, so a
 * departure and an arrival can both be ready before the flight.
 *
 * Persisted to localStorage so the detached flight strip window, its own
 * renderer, reads the same routes and follows changes through `storage`
 * events (see `useCrossWindowStoreSync`). The main window clears it at
 * startup: a route belongs to the session it was planned in.
 */
import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { GuidanceDirection, GuidanceRoute } from '@/lib/taxiGuidance';

interface TaxiGuidanceState {
  departure: GuidanceRoute | null;
  arrival: GuidanceRoute | null;
  setRoute: (route: GuidanceRoute) => void;
  clearRoute: (direction: GuidanceDirection) => void;
  clearAll: () => void;
}

export const useTaxiGuidanceStore = create<TaxiGuidanceState>()(
  persist(
    (set) => ({
      departure: null,
      arrival: null,
      setRoute: (route) => set({ [route.direction]: route }),
      clearRoute: (direction) => set({ [direction]: null }),
      clearAll: () => set({ departure: null, arrival: null }),
    }),
    {
      name: 'x-dispatch-taxi-guidance',
      version: 1,
      partialize: (state) => ({ departure: state.departure, arrival: state.arrival }),
    }
  )
);

/** The planned routes, departure first. */
export function guidanceRoutes(state: Pick<TaxiGuidanceState, 'departure' | 'arrival'>) {
  const routes: GuidanceRoute[] = [];
  if (state.departure) routes.push(state.departure);
  if (state.arrival) routes.push(state.arrival);
  return routes;
}
