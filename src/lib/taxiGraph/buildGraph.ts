import type { TaxiNetwork } from '@/types/apt';
import { bearingDeg, haversineMetres } from './geo';
import type { AdjacencyList, GraphEdge, IndexedNode, TaxiGraph } from './types';

/**
 * Build a TaxiGraph from parsed TaxiNetwork data. Runway edges are kept so
 * routes can cross or, as a last resort, use a runway; the router decides
 * when they may be used.
 */
export function buildTaxiGraph(network: TaxiNetwork): TaxiGraph {
  const nodes = new Map<number, IndexedNode>();
  for (const n of network.nodes) {
    nodes.set(n.id, { id: n.id, lat: n.latitude, lon: n.longitude });
  }

  const adjacency: AdjacencyList = new Map();
  const againstOneway: AdjacencyList = new Map();

  for (const edge of network.edges) {
    const from = nodes.get(edge.fromNodeId);
    const to = nodes.get(edge.toNodeId);
    if (!from || !to) continue;

    const distance = haversineMetres(from.lat, from.lon, to.lat, to.lon);
    const bearing = distance > 0 ? bearingDeg(from, to) : NaN;

    const fwd: GraphEdge = { toNodeId: to.id, distance, bearing, edge };
    if (!adjacency.has(from.id)) adjacency.set(from.id, []);
    adjacency.get(from.id)!.push(fwd);

    const rev: GraphEdge = {
      toNodeId: from.id,
      distance,
      bearing: distance > 0 ? (bearing + 180) % 360 : NaN,
      edge,
    };
    const reverse = edge.direction === 'twoway' ? adjacency : againstOneway;
    if (!reverse.has(to.id)) reverse.set(to.id, []);
    reverse.get(to.id)!.push(rev);
  }

  return {
    adjacency,
    againstOneway,
    nodes,
    nodeList: Array.from(nodes.values()),
  };
}
