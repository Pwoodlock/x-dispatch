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

/**
 * The point on the taxi network nearest a lon/lat, on the centreline of the
 * edge under it. Dragging the route follows this, so the handle slides along
 * the taxiway instead of jumping between nodes.
 */
export function findNearestEdge(graph: TaxiGraph, lon: number, lat: number): EdgeSnap | null {
  const cursor = { lat, lon };
  let best: EdgeSnap | null = null;
  for (const [fromId, edges] of graph.adjacency) {
    const a = graph.nodes.get(fromId);
    if (!a) continue;
    for (const e of edges) {
      // Twoway edges are listed both ways; one direction is enough.
      if (e.edge.direction === 'twoway' && e.toNodeId < fromId) continue;
      const b = graph.nodes.get(e.toNodeId);
      if (!b) continue;
      const ab = toLocalMetres(a, b);
      const ac = toLocalMetres(a, cursor);
      const lenSq = ab.x * ab.x + ab.y * ab.y;
      const t = lenSq > 0 ? Math.max(0, Math.min(1, (ac.x * ab.x + ac.y * ab.y) / lenSq)) : 0;
      const distance = Math.hypot(ac.x - ab.x * t, ac.y - ab.y * t);
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
