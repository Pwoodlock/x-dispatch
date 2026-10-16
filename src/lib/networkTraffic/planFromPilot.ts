/**
 * "Use as my flight plan": a network pilot's filed city pair, route and cruise handed to the
 * plan builder, which opens for the user to review, adjust and save.
 */
import { toEndpoint } from '@/components/dialogs/FlightPlanBuilder/AirportPicker';
import type { Airport } from '@/lib/xplaneServices/dataService';
import { usePlanBuilderStore } from '@/stores/planBuilderStore';
import type { NetworkPilot } from '@/types/networkTraffic';

/** Both filed airports exist in X-Plane's database, so the plan can be built. */
export function canPlanFromPilot(airports: Airport[], pilot: NetworkPilot): boolean {
  return planAirports(airports, pilot) !== null;
}

function planAirports(
  airports: Airport[],
  pilot: NetworkPilot
): { departure: Airport; arrival: Airport } | null {
  const fp = pilot.flightPlan;
  if (!fp?.departure || !fp.arrival) return null;
  const departure = airports.find((a) => a.icao === fp.departure);
  const arrival = airports.find((a) => a.icao === fp.arrival);
  return departure && arrival ? { departure, arrival } : null;
}

/**
 * Fills the planner from the pilot's plan and opens it. False, with the planner untouched,
 * when either airport is unknown to X-Plane.
 */
export function openPlannerForPilot(airports: Airport[], pilot: NetworkPilot): boolean {
  const pair = planAirports(airports, pilot);
  const fp = pilot.flightPlan;
  if (!pair || !fp) return false;
  const builder = usePlanBuilderStore.getState();
  // Setting an endpoint clears the route, so the route and cruise go in last.
  builder.setDeparture(toEndpoint(pair.departure));
  builder.setArrival(toEndpoint(pair.arrival));
  builder.setAlternate(null);
  builder.setRouteText(fp.route);
  builder.setRouteSource(pilot.network);
  builder.setCruiseAltitude(fp.cruiseAltitudeFt);
  builder.open();
  return true;
}
