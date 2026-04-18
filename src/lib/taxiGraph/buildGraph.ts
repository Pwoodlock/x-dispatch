import type { TaxiNetwork } from '@/types/apt';
import type { AdjacencyList, GraphEdge, IndexedNode, TaxiGraph } from './types';

/** Haversine distance between two lat/lon points in metres */
function haversineMetres(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6_371_000;
  const toRad = Math.PI / 180;
  const dLat = (lat2 - lat1) * toRad;
  const dLon = (lon2 - lon1) * toRad;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * toRad) * Math.cos(lat2 * toRad) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/**
 * Build a TaxiGraph from parsed TaxiNetwork data.
 * Skips runway edges — routing stops at hold-short nodes.
 */
export function buildTaxiGraph(network: TaxiNetwork): TaxiGraph {
  const nodes = new Map<number, IndexedNode>();
  for (const n of network.nodes) {
    nodes.set(n.id, { id: n.id, lat: n.latitude, lon: n.longitude });
  }

  const adjacency: AdjacencyList = new Map();

  for (const edge of network.edges) {
    // Skip runway edges — route ends at hold-short point
    if (edge.widthClass === 'runway') continue;

    const from = nodes.get(edge.fromNodeId);
    const to = nodes.get(edge.toNodeId);
    if (!from || !to) continue;

    const distance = haversineMetres(from.lat, from.lon, to.lat, to.lon);
    const fwd: GraphEdge = { toNodeId: to.id, distance, edge };
    const rev: GraphEdge = { toNodeId: from.id, distance, edge };

    // Forward direction always added
    if (!adjacency.has(from.id)) adjacency.set(from.id, []);
    adjacency.get(from.id)!.push(fwd);

    // Reverse only for twoway edges
    if (edge.direction === 'twoway') {
      if (!adjacency.has(to.id)) adjacency.set(to.id, []);
      adjacency.get(to.id)!.push(rev);
    }
  }

  return {
    adjacency,
    nodes,
    nodeList: Array.from(nodes.values()),
  };
}
