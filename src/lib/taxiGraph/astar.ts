import type { PathResult, TaxiGraph } from './types';

/** Haversine heuristic in metres — admissible, never overestimates */
function heuristic(graph: TaxiGraph, fromId: number, toId: number): number {
  const a = graph.nodes.get(fromId);
  const b = graph.nodes.get(toId);
  if (!a || !b) return 0;

  const R = 6_371_000;
  const toRad = Math.PI / 180;
  const dLat = (b.lat - a.lat) * toRad;
  const dLon = (b.lon - a.lon) * toRad;
  const x =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(a.lat * toRad) * Math.cos(b.lat * toRad) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x));
}

/**
 * A* shortest path between two nodes.
 * Returns null if no path exists.
 */
export function findPath(graph: TaxiGraph, startId: number, endId: number): PathResult | null {
  if (startId === endId) {
    return { nodeIds: [startId], totalDistance: 0, taxiwayNames: [] };
  }

  const openSet = new Set<number>([startId]);
  const cameFrom = new Map<number, number>();
  const gScore = new Map<number, number>();
  const fScore = new Map<number, number>();

  gScore.set(startId, 0);
  fScore.set(startId, heuristic(graph, startId, endId));

  while (openSet.size > 0) {
    // Pick node in openSet with lowest fScore
    let current = -1;
    let currentF = Infinity;
    for (const id of openSet) {
      const f = fScore.get(id) ?? Infinity;
      if (f < currentF) {
        currentF = f;
        current = id;
      }
    }

    if (current === endId) {
      // Reconstruct path
      const nodeIds: number[] = [current];
      while (cameFrom.has(current)) {
        current = cameFrom.get(current)!;
        nodeIds.unshift(current);
      }

      // Collect taxiway names and total distance
      let totalDistance = 0;
      const taxiwayNames: string[] = [];
      for (let i = 0; i < nodeIds.length - 1; i++) {
        const neighbors = graph.adjacency.get(nodeIds[i]!) ?? [];
        const edge = neighbors.find((e) => e.toNodeId === nodeIds[i + 1]!);
        if (edge) {
          totalDistance += edge.distance;
          taxiwayNames.push(edge.edge.name);
        }
      }

      return { nodeIds, totalDistance, taxiwayNames };
    }

    openSet.delete(current);
    const neighbors = graph.adjacency.get(current) ?? [];

    for (const neighbor of neighbors) {
      const tentativeG = (gScore.get(current) ?? Infinity) + neighbor.distance;
      if (tentativeG < (gScore.get(neighbor.toNodeId) ?? Infinity)) {
        cameFrom.set(neighbor.toNodeId, current);
        gScore.set(neighbor.toNodeId, tentativeG);
        fScore.set(neighbor.toNodeId, tentativeG + heuristic(graph, neighbor.toNodeId, endId));
        openSet.add(neighbor.toNodeId);
      }
    }
  }

  return null; // No path found
}
