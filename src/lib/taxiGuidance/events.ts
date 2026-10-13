import {
  type RouteGeometry,
  type Vec,
  bearingOf,
  pointAtDistance,
  signedTurn,
  toLatLon,
} from './geometry';
import type { GuidanceEvent, GuidancePoint, GuidanceRoute, TurnKind } from './types';

/** How far each side of a junction to look when measuring the turn, so a short curved edge doesn't skew it. */
const TURN_SAMPLE_M = 25;
/** Half the length of a hold-short bar across the taxiway, and the gap between its two lines. */
const HOLD_BAR_HALF_WIDTH_M = 12;
const HOLD_BAR_GAP_M = 3;

/** Turn thresholds in degrees of heading change. */
const CONTINUE_MAX_DEG = 25;
const BEAR_MAX_DEG = 60;
const TURN_MAX_DEG = 130;

export function classifyTurn(deltaDeg: number): TurnKind {
  const a = Math.abs(deltaDeg);
  if (a < CONTINUE_MAX_DEG) return 'continue';
  const right = deltaDeg > 0;
  if (a < BEAR_MAX_DEG) return right ? 'bearRight' : 'bearLeft';
  if (a < TURN_MAX_DEG) return right ? 'turnRight' : 'turnLeft';
  return right ? 'sharpRight' : 'sharpLeft';
}

/** Heading change at route point `j`, measured over the last and next few metres. */
function turnAt(g: RouteGeometry, j: number): number {
  const node = g.xy[j]!;
  const before = pointAtDistance(g, g.cum[j]! - TURN_SAMPLE_M).point;
  const after = pointAtDistance(g, g.cum[j]! + TURN_SAMPLE_M).point;
  return signedTurn(bearingOf(before, node), bearingOf(node, after));
}

/** A blank leg name carries the previous one, so an unnamed connector isn't announced as a new taxiway. */
function effectiveNames(route: GuidanceRoute): string[] {
  const names = route.legs.map((l) => l.name);
  for (let i = 1; i < names.length; i++) if (!names[i]) names[i] = names[i - 1]!;
  for (let i = names.length - 2; i >= 0; i--) if (!names[i]) names[i] = names[i + 1]!;
  return names;
}

/** The runway end the pilot knows (`14L`) when it belongs to this zone, else the zone's key (`14L/32R`). */
function runwayLabel(route: GuidanceRoute, key: string): string {
  return route.runway && key.split('/').includes(route.runway) ? route.runway : key;
}

/** Hold and cross ahead of turns at the same spot: the pilot stops before turning onto the runway's zone. */
const KIND_ORDER: Record<GuidanceEvent['kind'], number> = {
  cross: 0,
  holdShort: 0,
  turn: 1,
  arrive: 2,
};

/**
 * Everything the pilot has to do along the route, in order. A runway zone the
 * route enters and stays in until the end is the runway it is taxiing to (hold
 * short); one it enters and leaves again is a crossing.
 */
export function computeEvents(route: GuidanceRoute, g: RouteGeometry): GuidanceEvent[] {
  const events: GuidanceEvent[] = [];
  const legs = route.legs;
  const names = effectiveNames(route);

  for (let j = 1; j < legs.length; j++) {
    const leg = legs[j]!;
    const prev = legs[j - 1]!;
    const at = g.cum[j]!;

    for (const key of leg.runways) {
      if (prev.runways.includes(key)) continue;
      let staysToEnd = true;
      for (let k = j + 1; k < legs.length; k++) {
        if (!legs[k]!.runways.includes(key)) {
          staysToEnd = false;
          break;
        }
      }
      const runway = runwayLabel(route, key);
      events.push(
        staysToEnd
          ? { kind: 'holdShort', runway, at, pointIndex: j }
          : { kind: 'cross', runway, at, pointIndex: j }
      );
    }

    // Runway legs are covered by the hold/cross above; turns are taxiway changes.
    if (leg.isRunway) continue;
    if (names[j] && names[j] !== names[j - 1]) {
      events.push({ kind: 'turn', turn: classifyTurn(turnAt(g, j)), name: names[j]!, at });
    }
  }

  if (route.direction === 'departure') {
    // Without zone data the route still ends at the runway: hold short at its end.
    if (!events.some((e) => e.kind === 'holdShort')) {
      const lastRunway = [...legs].reverse().find((l) => l.isRunway)?.name;
      events.push({
        kind: 'holdShort',
        runway: route.runway ?? lastRunway ?? '',
        at: g.total,
        pointIndex: null,
      });
    }
  } else {
    events.push({ kind: 'arrive', name: route.gateName, at: g.total });
  }

  events.sort((a, b) => a.at - b.at || KIND_ORDER[a.kind] - KIND_ORDER[b.kind]);

  // Past the departure runway's hold line the aircraft is lining up, on tower's
  // clearance: the network edges it rolls over there are not instructions.
  if (route.direction === 'departure') {
    const hold = events.findIndex((e) => e.kind === 'holdShort');
    if (hold >= 0) return events.slice(0, hold + 1);
  }
  return events;
}

/**
 * Red double lines across the route where it enters a runway's protected area,
 * as lon/lat line pairs. Built from the route's own direction of travel, so a
 * bar always sits square across the taxiway the aircraft is on.
 */
export function holdBarLines(g: RouteGeometry, events: GuidanceEvent[]): GuidancePoint[][] {
  const lines: GuidancePoint[][] = [];
  for (const e of events) {
    if ((e.kind !== 'holdShort' && e.kind !== 'cross') || e.pointIndex === null) continue;
    const p = g.xy[e.pointIndex]!;
    const ahead = pointAtDistance(g, g.cum[e.pointIndex]! + 10).point;
    const len = Math.hypot(ahead.x - p.x, ahead.y - p.y);
    if (len === 0) continue;
    const u = { x: (ahead.x - p.x) / len, y: (ahead.y - p.y) / len };
    const n = { x: u.y, y: -u.x };
    for (const back of [0, HOLD_BAR_GAP_M]) {
      const c: Vec = { x: p.x - u.x * back, y: p.y - u.y * back };
      lines.push([
        toLatLon(g, { x: c.x + n.x * HOLD_BAR_HALF_WIDTH_M, y: c.y + n.y * HOLD_BAR_HALF_WIDTH_M }),
        toLatLon(g, { x: c.x - n.x * HOLD_BAR_HALF_WIDTH_M, y: c.y - n.y * HOLD_BAR_HALF_WIDTH_M }),
      ]);
    }
  }
  return lines;
}
