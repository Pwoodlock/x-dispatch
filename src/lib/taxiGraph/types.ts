import type { TaxiEdge } from '@/types/apt';

/** Adjacency list entry — one neighbor reachable from a node */
export interface GraphEdge {
  toNodeId: number;
  /** Distance in metres (haversine between the two nodes) */
  distance: number;
  /** Reference to the original TaxiEdge for metadata access */
  edge: TaxiEdge;
}

/** Adjacency list keyed by node ID */
export type AdjacencyList = Map<number, GraphEdge[]>;

/** Spatial index entry for nearest-node lookup */
export interface IndexedNode {
  id: number;
  lat: number;
  lon: number;
}

/** Result of an A* pathfind */
export interface PathResult {
  /** Ordered node IDs from start to end */
  nodeIds: number[];
  /** Total distance in metres */
  totalDistance: number;
  /** Taxiway names traversed in order (may have duplicates for consecutive edges on same taxiway) */
  taxiwayNames: string[];
}

/** Prebuilt graph ready for queries */
export interface TaxiGraph {
  adjacency: AdjacencyList;
  nodes: Map<number, IndexedNode>;
  /** All indexed nodes as flat array for spatial search */
  nodeList: IndexedNode[];
}
