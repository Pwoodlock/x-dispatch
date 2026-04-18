import type { IndexedNode, TaxiGraph } from './types';

/**
 * Find the nearest taxi network node to a given lon/lat.
 * Returns null if the graph has no nodes.
 *
 * Uses equirectangular approximation — accurate enough for
 * sub-airport distances (< 5 km).
 */
export function findNearestNode(graph: TaxiGraph, lon: number, lat: number): IndexedNode | null {
  const nodes = graph.nodeList;
  if (nodes.length === 0) return null;

  let best: IndexedNode | null = null;
  let bestDist = Infinity;

  // cos(lat) correction for longitude at this latitude
  const cosLat = Math.cos((lat * Math.PI) / 180);

  for (const node of nodes) {
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
