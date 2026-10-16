import type { TaxiGraph } from '@/lib/taxiGraph';
import { edgeRunways } from '@/lib/taxiGraph/runwayZones';
import type { TaxiEdge } from '@/types/apt';
import type {
  GuidanceDirection,
  GuidanceLeg,
  GuidancePoint,
  GuidanceRoute,
  GuidanceSource,
  StandPoint,
} from './types';

/** Two route nodes closer than this (degrees, ~5 cm) are the same junction under different IDs. */
const COINCIDENT_DEG = 5e-7;

function findEdge(graph: TaxiGraph, from: number, to: number): TaxiEdge | null {
  return graph.adjacency.get(from)?.find((e) => e.toNodeId === to)?.edge ?? null;
}

/**
 * Snapshot of a planned network route with the metadata guidance needs, so the
 * route can be followed without the taxi graph (in the detached strip window).
 */
export function buildGuidanceRoute(
  graph: TaxiGraph,
  nodeIds: number[],
  meta: {
    icao: string;
    direction: GuidanceDirection;
    runway: string | null;
    gateName: string | null;
    source: GuidanceSource;
    anchorNodeIds: number[];
    standLink?: { from: StandPoint | null; to: StandPoint | null };
  }
): GuidanceRoute | null {
  const points: GuidancePoint[] = [];
  const legs: GuidanceLeg[] = [];
  let prevId: number | null = null;
  const link = meta.standLink;
  // The stretch from the stand's point on the taxiway to the first node.
  if (link?.from) points.push({ lat: link.from.lat, lon: link.from.lon });

  for (const id of nodeIds) {
    const node = graph.nodes.get(id);
    if (!node) continue;
    const last = points[points.length - 1];
    if (
      last &&
      Math.abs(last.lat - node.lat) < COINCIDENT_DEG &&
      Math.abs(last.lon - node.lon) < COINCIDENT_DEG
    ) {
      prevId = id;
      continue;
    }
    if (prevId === null && points.length > 0) {
      legs.push({ name: link!.from!.name, isRunway: false, runways: [] });
    } else if (prevId !== null) {
      // The router only steps along real edges; a gap the planner bridged directly has none.
      const edge = findEdge(graph, prevId, id);
      legs.push(
        edge
          ? { name: edge.name, isRunway: edge.widthClass === 'runway', runways: edgeRunways(edge) }
          : { name: '', isRunway: false, runways: [] }
      );
    }
    points.push({ lat: node.lat, lon: node.lon });
    prevId = id;
  }

  if (link?.to && points.length > 0) {
    points.push({ lat: link.to.lat, lon: link.to.lon });
    legs.push({ name: link.to.name, isRunway: false, runways: [] });
  }

  if (points.length < 2) return null;
  return { ...meta, points, legs, nodeIds: [...nodeIds] };
}
