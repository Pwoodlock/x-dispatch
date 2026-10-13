import { computeEvents, holdBarLines } from './events';
import { type RouteGeometry, buildGeometry, pointAtDistance, toLatLon, toLocal } from './geometry';
import { type GuidanceView, guidanceView } from './instruction';
import { type RouteProgress, trackProgress } from './progress';
import type { GuidanceEvent, GuidancePoint, GuidanceRoute } from './types';

/** Further than this from every route, the aircraft is somewhere else and nothing is tracked. */
const NEAR_ROUTE_M = 1500;

interface PreparedRoute {
  geometry: RouteGeometry;
  events: GuidanceEvent[];
  holdBars: GuidancePoint[][];
}

const prepared = new WeakMap<GuidanceRoute, PreparedRoute>();

/** Geometry, events and hold bars of a route, computed once per route object. */
export function prepareRoute(route: GuidanceRoute): PreparedRoute {
  let p = prepared.get(route);
  if (!p) {
    const geometry = buildGeometry(route.points);
    const events = computeEvents(route, geometry);
    p = { geometry, events, holdBars: holdBarLines(geometry, events) };
    prepared.set(route, p);
  }
  return p;
}

export interface TrackedGuidance {
  route: GuidanceRoute;
  progress: RouteProgress;
  view: GuidanceView;
  /** The part of the route still ahead, from the aircraft's spot on it to the end. */
  remaining: GuidancePoint[];
}

/**
 * Follows the aircraft along whichever planned route it is on. Keeps the last
 * fix per route between updates, so each window (main map, detached strip)
 * owns one tracker.
 */
export function createGuidanceTracker() {
  const last = new WeakMap<GuidanceRoute, RouteProgress>();

  return {
    update(
      routes: ReadonlyArray<GuidanceRoute>,
      position: { lat: number; lon: number } | null
    ): TrackedGuidance | null {
      if (!position) return null;
      let best: { route: GuidanceRoute; progress: RouteProgress } | null = null;
      for (const route of routes) {
        const { geometry } = prepareRoute(route);
        const p = toLocal(geometry, position.lat, position.lon);
        const progress = trackProgress(geometry, p, last.get(route) ?? null);
        if (!progress) continue;
        last.set(route, progress);
        if (
          progress.lateral <= NEAR_ROUTE_M &&
          (!best || progress.lateral < best.progress.lateral)
        ) {
          best = { route, progress };
        }
      }
      if (!best) return null;

      const { geometry, events } = prepareRoute(best.route);
      const { progress } = best;
      const { point, segIndex } = pointAtDistance(geometry, progress.along);
      const remaining = [toLatLon(geometry, point), ...best.route.points.slice(segIndex + 1)];
      return {
        route: best.route,
        progress,
        view: guidanceView(events, progress, geometry.total),
        remaining,
      };
    },
  };
}
