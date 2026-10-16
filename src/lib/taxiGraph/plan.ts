import type { Runway } from '@/types/apt';
import { bearingDeg, haversineMetres, toLocalMetres, turnDeg } from './geo';
import { edgeRunways, runwayKey } from './runwayZones';
import { type SearchStart, edgeBetween, search, summarizePath } from './search';
import type { GraphEdge, PathResult, StandLink, TaxiGraph } from './types';

/** Sharpest turn allowed from a taxiway onto the runway heading to line up, or off it at an exit. */
const MAX_RUNWAY_TURN_DEG = 120;
/** Taxi metres a departure gives up per metre of runway lost by entering past the best entry. */
const RUNWAY_LOSS_WEIGHT = 3;
/** Taxi metres an arrival gives up per metre of rollout past the first usable exit. */
const EXTRA_ROLL_WEIGHT = 0.5;
/** Rollout before the first exit a landing aircraft can take, at most. */
const MIN_ROLLOUT_M = 1300;
/** Extra cost of entering another runway's protected area, so routes cross no more runways than needed. */
const CROSSING_COST_M = 300;
/** A node this close to the centreline (beyond half the runway width) is on the runway. */
const ON_RUNWAY_MARGIN_M = 10;
/** Longest chain of protected-area edges between a hold line and the runway. */
const MAX_ENTRY_EDGES = 8;
/** Edges this much further from a stand than the nearest one still connect it. */
const ATTACH_SLACK_M = 75;
/** Cost per metre of getting from the stand onto an edge, against taxiing along it. */
const ATTACH_OFF_WEIGHT = 2;

interface Point {
  lat: number;
  lon: number;
}

/** One runway end as the router needs it: where it starts, which way it points, how long it is. */
interface RunwayAxis {
  end: Point;
  key: string;
  heading: number;
  length: number;
  width: number;
  displaced: number;
}

function runwayAxis(runways: readonly Runway[], endName: string): RunwayAxis | null {
  for (const rwy of runways) {
    const i = rwy.ends.findIndex((e) => e.name === endName);
    if (i === -1) continue;
    const a = rwy.ends[i]!;
    const b = rwy.ends[1 - i]!;
    const end = { lat: a.latitude, lon: a.longitude };
    const other = { lat: b.latitude, lon: b.longitude };
    return {
      end,
      key: runwayKey(endName),
      heading: bearingDeg(end, other),
      length: haversineMetres(end.lat, end.lon, other.lat, other.lon),
      width: rwy.width,
      displaced: a.dthr_length,
    };
  }
  return null;
}

/** How far along the runway from its end, and how far off the centreline, a point is. */
function alongAndOff(axis: RunwayAxis, p: Point): { along: number; off: number } {
  const v = toLocalMetres(axis.end, p);
  const h = (axis.heading * Math.PI) / 180;
  return {
    along: v.x * Math.sin(h) + v.y * Math.cos(h),
    off: Math.abs(v.x * Math.cos(h) - v.y * Math.sin(h)),
  };
}

/** The runway's geometry on the taxi network: its nodes, and which edges lie in its protected area. */
function runwayArea(graph: TaxiGraph, axis: RunwayAxis) {
  const onRunway = (id: number) => {
    const node = graph.nodes.get(id);
    if (!node) return false;
    const { along, off } = alongAndOff(axis, node);
    return off <= axis.width / 2 + ON_RUNWAY_MARGIN_M && along >= -50 && along <= axis.length + 50;
  };

  // By position rather than by runway edges: sceneries often draw a crossing
  // as a taxiway running straight over the centreline, with no runway edge.
  const runwayNodes = new Set<number>();
  for (const node of graph.nodeList) if (onRunway(node.id)) runwayNodes.add(node.id);

  /** The edge touches the runway itself. */
  const touchesRunway = (from: number, e: GraphEdge) =>
    runwayNodes.has(from) || runwayNodes.has(e.toNodeId);
  /** The edge is on the runway or in its protected area. */
  const inArea = (from: number, e: GraphEdge) =>
    touchesRunway(from, e) || edgeRunways(e.edge).includes(axis.key);

  return { runwayNodes, touchesRunway, inArea };
}

/** Extra cost each time the route enters a runway's protected area, other than `ownKey`'s. */
function crossingCost(ownKey: string | null) {
  return (prev: GraphEdge | null, next: GraphEdge) => {
    const before = prev ? edgeRunways(prev.edge) : [];
    let cost = 0;
    for (const key of edgeRunways(next.edge)) {
      if (key !== ownKey && !before.includes(key)) cost += CROSSING_COST_M;
    }
    return cost;
  };
}

/**
 * Where a stand joins the network: the taxiway edges near it, as ways to
 * leave it (`starts`) and nodes to reach it from (`ends`, with the distance
 * still to go). Every edge within a short slack of the nearest one counts, so
 * a stand on a scrap of network the author left unlinked still gets a route.
 */
function gateAttachment(graph: TaxiGraph, gate: Point) {
  return attachTo(graph, gate, true) ?? attachTo(graph, gate, false);
}

/** `gateAttachment` on taxiways clear of runways only, or, for a network with none, on any edge. */
function attachTo(graph: TaxiGraph, gate: Point, clearOfRunways: boolean) {
  const near: { from: number; edge: GraphEdge; off: number; t: number }[] = [];
  for (const [from, edges] of graph.adjacency) {
    const a = graph.nodes.get(from);
    if (!a) continue;
    for (const e of edges) {
      const nearRunway = e.edge.widthClass === 'runway' || edgeRunways(e.edge).length > 0;
      if (clearOfRunways && nearRunway) continue;
      const b = graph.nodes.get(e.toNodeId);
      if (!b) continue;
      const pb = toLocalMetres(a, b);
      const pg = toLocalMetres(a, gate);
      const lenSq = pb.x * pb.x + pb.y * pb.y;
      const t = lenSq > 0 ? Math.max(0, Math.min(1, (pg.x * pb.x + pg.y * pb.y) / lenSq)) : 0;
      near.push({ from, edge: e, off: Math.hypot(pg.x - pb.x * t, pg.y - pb.y * t), t });
    }
  }
  if (near.length === 0) return null;

  const closest = Math.min(...near.map((n) => n.off));
  const starts: (SearchStart & { link: Link })[] = [];
  const ends = new Map<number, { cost: number; link: Link }>();
  for (const { from, edge, off, t } of near) {
    if (off > closest + ATTACH_SLACK_M) continue;
    const a = graph.nodes.get(from)!;
    const b = graph.nodes.get(edge.toNodeId)!;
    const point: StandLink = {
      lat: a.lat + (b.lat - a.lat) * t,
      lon: a.lon + (b.lon - a.lon) * t,
      name: edge.edge.name,
    };
    const reach = ATTACH_OFF_WEIGHT * off;
    // Leaving: join the edge and taxi on to its far node.
    const onward = edge.distance * (1 - t);
    starts.push({
      nodeId: edge.toNodeId,
      cost: reach + onward,
      bearing: Number.isNaN(edge.bearing) ? null : edge.bearing,
      prevNodeId: from,
      link: { point, distance: onward },
    });
    // Arriving: reach its near node, then taxi along it to the stand.
    const back = edge.distance * t;
    if (reach + back < (ends.get(from)?.cost ?? Infinity)) {
      ends.set(from, { cost: reach + back, link: { point, distance: back } });
    }
  }
  return { starts, ends };
}

/** A stand's point on the network, and the taxiing between it and the edge's node. */
interface Link {
  point: StandLink;
  distance: number;
}

/** A hold-short point for a departure, and how it leads onto the runway. */
interface RunwayEntry {
  holdNodeId: number;
  /** Heading of the first step past the hold line. */
  bearing: number;
  /** Where the entry meets the runway, in metres from the runway end. */
  along: number;
}

/**
 * Hold-short points for departing from `axis`: the last node before each way
 * into the runway's protected area, kept when the aircraft can turn onto the
 * runway heading from it.
 */
function runwayEntries(
  graph: TaxiGraph,
  axis: RunwayAxis,
  { runwayNodes, inArea }: ReturnType<typeof runwayArea>,
  maxLineupTurn: number
): RunwayEntry[] {
  const outside = new Set<number>();
  for (const [from, edges] of graph.adjacency) {
    for (const e of edges) {
      if (inArea(from, e)) continue;
      outside.add(from);
      outside.add(e.toNodeId);
    }
  }

  const entries: RunwayEntry[] = [];
  for (const hold of outside) {
    if (runwayNodes.has(hold)) continue;
    for (const first of graph.adjacency.get(hold) ?? []) {
      if (!inArea(hold, first) || Number.isNaN(first.bearing)) continue;
      // Walk the protected-area edges in from the hold line to the centreline.
      const stack: { at: number; via: GraphEdge; depth: number }[] = [
        { at: first.toNodeId, via: first, depth: 1 },
      ];
      const seen = new Set<number>([hold]);
      while (stack.length > 0) {
        const { at, via, depth } = stack.pop()!;
        if (seen.has(at)) continue;
        seen.add(at);
        if (runwayNodes.has(at)) {
          if (turnDeg(via.bearing, axis.heading) <= maxLineupTurn) {
            const node = graph.nodes.get(at)!;
            entries.push({
              holdNodeId: hold,
              bearing: first.bearing,
              along: alongAndOff(axis, node).along,
            });
          }
          continue;
        }
        if (depth >= MAX_ENTRY_EDGES) continue;
        for (const next of graph.adjacency.get(at) ?? []) {
          if (!inArea(at, next) || Number.isNaN(next.bearing)) continue;
          if (turnDeg(via.bearing, next.bearing) > MAX_RUNWAY_TURN_DEG) continue;
          stack.push({ at: next.toNodeId, via: next, depth: depth + 1 });
        }
      }
    }
  }
  return entries;
}

/**
 * The route found, with the stretches between the stands and the network:
 * `from` the stand the route leaves (`starts`), `to` the one it reaches.
 */
function toResult(
  graph: TaxiGraph,
  nodeIds: number[] | null,
  ends: { from?: (SearchStart & { link: Link })[]; to?: Map<number, { link: Link }> } = {}
): PathResult | null {
  if (!nodeIds) return null;
  const first = nodeIds[0]!;
  const last = nodeIds[nodeIds.length - 1]!;
  const from = ends.from
    ?.filter((s) => s.nodeId === first)
    .reduce<(SearchStart & { link: Link }) | null>((a, s) => (a && a.cost <= s.cost ? a : s), null);
  const to = ends.to?.get(last);
  const result = summarizePath(graph, nodeIds);
  if (from) {
    result.from = from.link.point;
    result.totalDistance += from.link.distance;
    result.taxiwayNames.unshift(from.link.point.name);
  }
  if (to) {
    result.to = to.link.point;
    result.totalDistance += to.link.distance;
    result.taxiwayNames.push(to.link.point.name);
  }
  return result;
}

/**
 * Departure taxi route from a stand to the hold-short point of `runwayName`.
 * Prefers the entry nearest the runway end (a full-length departure), and
 * never puts the aircraft on the departure runway itself: lining up is
 * tower's call. Keeps to taxiways wide enough for `sizeCode`, the stand's
 * ICAO size, when it can.
 */
export function planDeparture(
  graph: TaxiGraph,
  runways: readonly Runway[],
  gate: Point,
  runwayName: string,
  sizeCode: string | null = null
): PathResult | null {
  const axis = runwayAxis(runways, runwayName);
  const attach = gateAttachment(graph, gate);
  if (!axis || !attach) return null;

  const area = runwayArea(graph, axis);
  // Where every entry needs a sharp turn to line up, the aircraft backtracks the runway.
  let entries = runwayEntries(graph, axis, area, MAX_RUNWAY_TURN_DEG);
  if (entries.length === 0) entries = runwayEntries(graph, axis, area, 180);
  if (entries.length === 0) {
    return lineUpRoute(graph, axis, area.runwayNodes, attach.starts, sizeCode);
  }
  const best = Math.min(...entries.map((e) => Math.max(e.along, 0)));
  const byHold = new Map<number, RunwayEntry[]>();
  for (const e of entries) byHold.set(e.holdNodeId, [...(byHold.get(e.holdNodeId) ?? []), e]);

  const goal = (nodeId: number, bearing: number | null, maxTurn: number) => {
    let cost: number | null = null;
    for (const e of byHold.get(nodeId) ?? []) {
      if (bearing !== null && turnDeg(bearing, e.bearing) > maxTurn) continue;
      const loss = RUNWAY_LOSS_WEIGHT * (Math.max(e.along, 0) - best);
      if (cost === null || loss < cost) cost = loss;
    }
    return cost;
  };

  // Passing through the departure runway's protected area (behind its end,
  // say) costs like any crossing; setting a wheel on the runway is kept for
  // networks that leave no other way to a hold line.
  const stepCost = crossingCost(null);
  const nodeIds =
    search(graph, {
      starts: attach.starts,
      goal,
      stepCost,
      sizeCode,
      blocked: area.touchesRunway,
    }) ?? search(graph, { starts: attach.starts, goal, stepCost, sizeCode });
  return toResult(graph, nodeIds, { from: attach.starts });
}

/**
 * Route onto the runway itself, at the node nearest its end, for a strip
 * whose whole network lies inside the runway's protected area: there is no
 * hold line to stop at.
 */
function lineUpRoute(
  graph: TaxiGraph,
  axis: RunwayAxis,
  runwayNodes: Set<number>,
  starts: (SearchStart & { link: Link })[],
  sizeCode: string | null
): PathResult | null {
  const along = new Map(
    [...runwayNodes].map((id) => [id, Math.max(0, alongAndOff(axis, graph.nodes.get(id)!).along)])
  );
  const nodeIds = search(graph, {
    starts,
    goal: (nodeId) => {
      const a = along.get(nodeId);
      return a === undefined ? null : RUNWAY_LOSS_WEIGHT * a;
    },
    stepCost: crossingCost(axis.key),
    sizeCode,
  });
  return toResult(graph, nodeIds, { from: starts });
}

/**
 * Arrival taxi route from a runway exit of `runwayName` (the end landed on)
 * to a stand. Starts where the aircraft turns off the runway: the first exit
 * it can make at a sensible angle after its rollout, or a later one when that
 * saves enough taxiing. Keeps to taxiways wide enough for `sizeCode`.
 */
export function planArrival(
  graph: TaxiGraph,
  runways: readonly Runway[],
  runwayName: string,
  gate: Point,
  sizeCode: string | null = null
): PathResult | null {
  const axis = runwayAxis(runways, runwayName);
  const attach = gateAttachment(graph, gate);
  if (!axis || !attach) return null;

  const { runwayNodes } = runwayArea(graph, axis);
  const firstExit = axis.displaced + Math.min(MIN_ROLLOUT_M, (axis.length - axis.displaced) / 2);
  const placed = [...runwayNodes]
    .map((id) => ({ id, along: alongAndOff(axis, graph.nodes.get(id)!).along }))
    .sort((a, b) => a.along - b.along);
  const reachable = placed.filter((n) => n.along >= firstExit);
  const candidates = reachable.length > 0 ? reachable : placed;

  const starts: SearchStart[] = candidates.map((n) => ({
    nodeId: n.id,
    cost: EXTRA_ROLL_WEIGHT * Math.max(0, n.along - firstExit),
    bearing: axis.heading,
    prevNodeId: null,
  }));
  const nodeIds = search(graph, {
    starts,
    goal: (nodeId) => attach.ends.get(nodeId)?.cost ?? null,
    stepCost: crossingCost(axis.key),
    sizeCode,
  });
  return toResult(graph, nodeIds, { to: attach.ends });
}

/**
 * Route between two picked nodes, for routes the pilot draws. `fromNodeId` is
 * the node the route reached `startId` from, so it carries on instead of
 * doubling back.
 */
export function findPath(
  graph: TaxiGraph,
  startId: number,
  endId: number,
  fromNodeId?: number,
  sizeCode: string | null = null
): PathResult | null {
  if (startId === endId) return { nodeIds: [startId], totalDistance: 0, taxiwayNames: [] };
  const into = fromNodeId !== undefined ? edgeBetween(graph, fromNodeId, startId) : null;
  const bearing = into && !Number.isNaN(into.bearing) ? into.bearing : null;
  const nodeIds = search(graph, {
    starts: [{ nodeId: startId, cost: 0, bearing, prevNodeId: into ? fromNodeId! : null }],
    goal: (nodeId) => (nodeId === endId ? 0 : null),
    stepCost: crossingCost(null),
    sizeCode,
  });
  return toResult(graph, nodeIds);
}
