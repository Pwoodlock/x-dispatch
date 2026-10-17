import { toLocalMetres } from './geo';
import type { IndexedNode, TaxiGraph } from './types';

/**
 * Find the nearest taxi network node to a given lon/lat.
 * Returns null if the graph has no nodes.
 *
 * When connectedOnly is true, only returns nodes that have at least
 * one edge in the adjacency list (skips isolated runway-only nodes).
 *
 * Uses equirectangular approximation — accurate enough for
 * sub-airport distances (< 5 km).
 */
export function findNearestNode(
  graph: TaxiGraph,
  lon: number,
  lat: number,
  connectedOnly = false
): IndexedNode | null {
  const nodes = graph.nodeList;
  if (nodes.length === 0) return null;

  let best: IndexedNode | null = null;
  let bestDist = Infinity;

  // cos(lat) correction for longitude at this latitude
  const cosLat = Math.cos((lat * Math.PI) / 180);

  for (const node of nodes) {
    if (connectedOnly && !graph.adjacency.has(node.id)) continue;

    const dLat = node.lat - lat;
    const dLon = (node.lon - lon) * cosLat;
    const dist = dLat * dLat + dLon * dLon;
    if (dist < bestDist) {
      bestDist = dist;
      best = node;
    }
  }

  return best;
}

export interface EdgeSnap {
  /** The cursor's foot on the edge. */
  lat: number;
  lon: number;
  /** Taxiway name, empty when the scenery left it blank. */
  name: string;
  /** The edge's node nearer the foot, the one a drop commits to the route. */
  nodeId: number;
  /** Distance from the cursor to the foot, in metres. */
  distance: number;
}

interface LatLon {
  lat: number;
  lon: number;
}

/** Where a point's foot falls along the edge a-b, as a fraction of it, and how far off the point is in metres. */
function footOnEdge(a: LatLon, b: LatLon, point: LatLon): { t: number; distance: number } {
  const ab = toLocalMetres(a, b);
  const ap = toLocalMetres(a, point);
  const lenSq = ab.x * ab.x + ab.y * ab.y;
  const t = lenSq > 0 ? Math.max(0, Math.min(1, (ap.x * ab.x + ap.y * ab.y) / lenSq)) : 0;
  return { t, distance: Math.hypot(ap.x - ab.x * t, ap.y - ab.y * t) };
}

/**
 * Whether the point lies on an edge ending at `nodeId`. A stand's point on
 * the network still meets a route that starts or ends at such a node.
 */
export function pointOnEdgeAt(
  graph: TaxiGraph,
  lon: number,
  lat: number,
  nodeId: number,
  withinM = 1
): boolean {
  const point = { lat, lon };
  for (const [fromId, edges] of graph.adjacency) {
    const a = graph.nodes.get(fromId);
    if (!a) continue;
    for (const e of edges) {
      if (fromId !== nodeId && e.toNodeId !== nodeId) continue;
      const b = graph.nodes.get(e.toNodeId);
      if (b && footOnEdge(a, b, point).distance <= withinM) return true;
    }
  }
  return false;
}

/**
 * The point on the taxi network nearest a lon/lat, on the centreline of the
 * edge under it. Dragging the route follows this, so the handle slides along
 * the taxiway instead of jumping between nodes.
 */
export function findNearestEdge(
  graph: TaxiGraph,
  lon: number,
  lat: number,
  /** Only edges with both ends passing this are considered. */
  nodeFilter?: (nodeId: number) => boolean
): EdgeSnap | null {
  const cursor = { lat, lon };
  let best: EdgeSnap | null = null;
  for (const [fromId, edges] of graph.adjacency) {
    if (nodeFilter && !nodeFilter(fromId)) continue;
    const a = graph.nodes.get(fromId);
    if (!a) continue;
    for (const e of edges) {
      // Twoway edges are listed both ways; one direction is enough.
      if (e.edge.direction === 'twoway' && e.toNodeId < fromId) continue;
      if (nodeFilter && !nodeFilter(e.toNodeId)) continue;
      const b = graph.nodes.get(e.toNodeId);
      if (!b) continue;
      const { t, distance } = footOnEdge(a, b, cursor);
      if (best && distance >= best.distance) continue;
      best = {
        lat: a.lat + (b.lat - a.lat) * t,
        lon: a.lon + (b.lon - a.lon) * t,
        name: e.edge.name,
        nodeId: t < 0.5 ? fromId : e.toNodeId,
        distance,
      };
    }
  }
  return best;
}
