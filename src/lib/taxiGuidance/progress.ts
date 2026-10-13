import { type RouteGeometry, type Vec, projectOnSegment } from './geometry';

export interface RouteProgress {
  /** Segment the aircraft is on: from `xy[segIndex]` to `xy[segIndex + 1]`. */
  segIndex: number;
  /** Metres from the route start to the aircraft's position on the route. */
  along: number;
  /** Metres from the aircraft to the route. */
  lateral: number;
}

/**
 * How far ahead of the last known position to look. A route can pass close to
 * itself (out along a taxiway and back on the parallel one); searching only a
 * short way ahead keeps the progress from jumping onto a later part of it.
 */
const LOOKAHEAD_M = 300;
/** Beyond this the window search has lost the aircraft and the whole route is searched again. */
const REACQUIRE_M = 40;

function closestOver(g: RouteGeometry, p: Vec, from: number, to: number): RouteProgress | null {
  let best: RouteProgress | null = null;
  for (let i = from; i <= to; i++) {
    const a = g.xy[i]!;
    const b = g.xy[i + 1]!;
    const hit = projectOnSegment(p, a, b);
    // `<=` so a junction, equally close to both of its segments, counts as the later one.
    if (!best || hit.distance <= best.lateral) {
      const along = g.cum[i]! + (g.cum[i + 1]! - g.cum[i]!) * hit.t;
      best = { segIndex: i, along, lateral: hit.distance };
    }
  }
  return best;
}

/**
 * Where the aircraft is along the route. With a previous fix the search stays
 * near it; without one, or once the aircraft is far from that window, the whole
 * route is searched.
 */
export function trackProgress(
  g: RouteGeometry,
  p: Vec,
  prev: RouteProgress | null
): RouteProgress | null {
  const lastSeg = g.xy.length - 2;
  if (lastSeg < 0) return null;
  const global = () => closestOver(g, p, 0, lastSeg);
  if (!prev) return global();

  const from = Math.max(0, prev.segIndex - 1);
  let to = Math.min(prev.segIndex, lastSeg);
  while (to < lastSeg && g.cum[to + 1]! <= prev.along + LOOKAHEAD_M) to++;
  const windowed = closestOver(g, p, from, to)!;
  if (windowed.lateral <= REACQUIRE_M) return windowed;

  const all = global()!;
  return all.lateral <= REACQUIRE_M ? all : windowed;
}
