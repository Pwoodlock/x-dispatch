import { useEffect } from 'react';
import { buildGuidanceRoute, createGuidanceTracker } from '@/lib/taxiGuidance';
import type { GuidanceDirection, GuidanceRoute } from '@/lib/taxiGuidance';
import { useAppStore } from '@/stores/appStore';
import { usePlaneStore } from '@/stores/planeStore';
import { useTaxiGuidanceStore } from '@/stores/taxiGuidanceStore';
import { useTaxiRouteStore } from '@/stores/taxiRouteStore';
import type { StartPosition } from '@/types/position';

type PlannerState = ReturnType<typeof useTaxiRouteStore.getState>;

export type GuidanceSyncAction =
  { type: 'publish' } | { type: 'clear'; direction: GuidanceDirection } | null;

/**
 * What a planner change means for the guidance route. A network route of two or
 * more nodes is published. The pilot cutting it below that (undo, clear, switching
 * the auto/manual mode) in the same planning session clears it. Closing or opening
 * the planner changes the session (`activeTaxiIcao`) and keeps the route, so
 * guidance survives the panel being closed.
 */
/** Points the planner's route is drawn through: its nodes and where it meets its stands. */
function drawnPoints(s: PlannerState): number {
  if (s.networkNodeIds.length === 0) return 0;
  return s.networkNodeIds.length + (s.standLink.from ? 1 : 0) + (s.standLink.to ? 1 : 0);
}

export function guidanceSyncAction(prev: PlannerState, next: PlannerState): GuidanceSyncAction {
  const changed =
    prev.networkNodeIds !== next.networkNodeIds ||
    prev.graph !== next.graph ||
    prev.direction !== next.direction ||
    prev.selectedRunway !== next.selectedRunway ||
    prev.mode !== next.mode ||
    prev.source !== next.source ||
    prev.standLink !== next.standLink ||
    prev.activeTaxiIcao !== next.activeTaxiIcao;
  if (!changed) return null;

  const hasRoute =
    next.mode === 'network' && drawnPoints(next) >= 2 && !!next.graph && !!next.activeTaxiIcao;
  if (hasRoute) return { type: 'publish' };

  const hadRoute = prev.mode === 'network' && drawnPoints(prev) >= 2;
  const sameSession =
    prev.activeTaxiIcao !== null &&
    prev.activeTaxiIcao === next.activeTaxiIcao &&
    prev.direction === next.direction;
  return hadRoute && sameSession ? { type: 'clear', direction: prev.direction } : null;
}

/**
 * The departure route starts at a gate the aircraft no longer starts from: the pilot picked
 * another start (a helipad, a runway, another stand) at that airport. A cleared start or one
 * at another airport leaves the route alone.
 */
export function departureLeftBehind(
  route: Pick<GuidanceRoute, 'icao' | 'gateName'> | null,
  start: Pick<StartPosition, 'airport' | 'name'> | null
): boolean {
  if (!route || !start) return false;
  return route.icao.toUpperCase() === start.airport.toUpperCase() && route.gateName !== start.name;
}

/**
 * Main window only: turns the planner's route into the guidance route both the
 * map and the detached strip follow, and drops the departure route once the
 * aircraft has taken off from it.
 */
export function useTaxiGuidancePublisher(): void {
  useEffect(() => {
    const guidance = useTaxiGuidanceStore.getState();

    const unsubPlanner = useTaxiRouteStore.subscribe((next, prev) => {
      const action = guidanceSyncAction(prev, next);
      if (!action) return;
      if (action.type === 'clear') {
        guidance.clearRoute(action.direction);
        return;
      }
      const route = buildGuidanceRoute(next.graph!, next.networkNodeIds, {
        icao: next.activeTaxiIcao!,
        direction: next.direction,
        runway: next.selectedRunway,
        gateName: useAppStore.getState().startPosition?.name ?? null,
        source: next.source,
        anchorNodeIds: next.clickedNodeIds,
        standLink: next.standLink,
      });
      if (route) guidance.setRoute(route);
    });

    const tracker = createGuidanceTracker();
    const unsubPlane = usePlaneStore.subscribe((next, prev) => {
      const airborne = next.state?.onGround === false && prev.state?.onGround === true;
      const departure = useTaxiGuidanceStore.getState().departure;
      if (!airborne || !departure || !next.state) return;
      const position = { lat: next.state.latitude, lon: next.state.longitude };
      if (tracker.update([departure], position)) guidance.clearRoute('departure');
    });

    const unsubStart = useAppStore.subscribe((next, prev) => {
      if (next.startPosition === prev.startPosition) return;
      const { departure } = useTaxiGuidanceStore.getState();
      if (departureLeftBehind(departure, next.startPosition)) guidance.clearRoute('departure');
    });

    return () => {
      unsubPlanner();
      unsubPlane();
      unsubStart();
    };
  }, []);
}
