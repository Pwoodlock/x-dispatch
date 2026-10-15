import type { GuidanceSource } from '@/lib/taxiGuidance';

type Direction = 'departure' | 'arrival';

/** A flight plan end as the flight plan store keeps it (from SimBrief or our planner). */
interface PlanEnd {
  icao: string;
  runway?: string;
}

export interface AutoRouteTarget {
  direction: Direction;
  runway: string;
}

/**
 * The runway the flight plan uses at this airport: its departure runway when this is the
 * departure airport, else its arrival runway when this is the arrival airport. Null when
 * the plan has no runway here, or names one the airport does not have.
 */
export function flightPlanTaxiTarget(
  icao: string,
  departure: PlanEnd | null,
  arrival: PlanEnd | null,
  runwayNames: readonly string[]
): AutoRouteTarget | null {
  const here = icao.toUpperCase();
  const target: AutoRouteTarget | null =
    departure?.icao.toUpperCase() === here && departure.runway
      ? { direction: 'departure', runway: departure.runway }
      : arrival?.icao.toUpperCase() === here && arrival.runway
        ? { direction: 'arrival', runway: arrival.runway }
        : null;
  return target && runwayNames.includes(target.runway) ? target : null;
}

/**
 * Whether the planner should take the flight plan's route: when it has none yet (a plan
 * imported after the gate was picked), or when its AUTO route goes to another runway than
 * the plan now does. A route the pilot planned is never replaced.
 */
export function replansAutoRoute(
  planner: {
    hasRoute: boolean;
    source: GuidanceSource;
    direction: Direction;
    runway: string | null;
  },
  target: AutoRouteTarget
): boolean {
  if (!planner.hasRoute) return true;
  if (planner.source !== 'auto') return false;
  return planner.direction !== target.direction || planner.runway !== target.runway;
}
