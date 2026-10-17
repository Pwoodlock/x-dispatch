/**
 * Taxi Route Store
 * Manages taxi route state for airport ground navigation.
 *
 * Two modes:
 * - network: clicks snap to taxi network nodes, the router fills in the path between them
 * - freehand: arbitrary clicks on the map (legacy behavior)
 */
import { create } from 'zustand';
import type { PathResult, StandLink, TaxiGraph } from '@/lib/taxiGraph';
import { findPath, pointOnEdgeAt, summarizePath } from '@/lib/taxiGraph';
import type { GuidanceSource } from '@/lib/taxiGuidance';

// ============================================================================
// Types
// ============================================================================

export interface TaxiRoutePoint {
  longitude: number;
  latitude: number;
}

export type TaxiRouteMode = 'network' | 'freehand';

/**
 * Direction of the auto-routed taxi path.
 *   - departure: gate → runway end (taxi out for takeoff)
 *   - arrival:   runway end → gate (taxi in after landing)
 *
 * Departures end at a hold-short point and arrivals start at a runway exit,
 * so the planner picks different endpoints for each.
 */
export type TaxiRouteDirection = 'departure' | 'arrival';

interface TaxiRouteState {
  mode: TaxiRouteMode;
  direction: TaxiRouteDirection;

  // --- Freehand mode state ---
  waypoints: TaxiRoutePoint[];

  // --- Network mode state ---
  /** The user-clicked node IDs (anchors for re-routing) */
  clickedNodeIds: number[];
  /** The full resolved path as node IDs (includes the router's intermediate nodes) */
  networkNodeIds: number[];
  /** Prebuilt graph for the active airport */
  graph: TaxiGraph | null;
  /** Last planned route, for the route summary (taxiway names, distance) */
  autoRouteResult: PathResult | null;
  /** Currently selected runway end name (e.g. "25R") */
  selectedRunway: string | null;
  /** Suggested by X-Dispatch until the pilot picks or edits anything. */
  source: GuidanceSource;
  /** ICAO size code of the stand the route starts or ends at; routes keep to taxiways that wide. */
  sizeCode: string | null;
  /** Where the route joins the network from its stand, and leaves it for its stand. */
  standLink: StandLinks;
  /** Earlier states of the network route, most recent last, for undo. */
  history: RouteSnapshot[];

  // --- Shared state ---
  activeTaxiIcao: string | null;
  clickModeEnabled: boolean;

  // Actions
  setMode: (mode: TaxiRouteMode) => void;
  setDirection: (direction: TaxiRouteDirection) => void;
  setGraph: (graph: TaxiGraph | null) => void;
  setSizeCode: (sizeCode: string | null) => void;
  setActiveAirport: (icao: string) => void;
  addWaypoint: (lon: number, lat: number) => void;
  addNetworkNode: (nodeId: number) => void;
  /** Take a route X-Dispatch planned from the stand to a runway, or the other way. */
  setAutoRoute: (result: PathResult, runwayName: string, source: GuidanceSource) => void;
  /** Replace a clicked anchor node at the given index with a new node, re-route */
  replaceNetworkNode: (anchorIndex: number, newNodeId: number) => void;
  /** Find which anchor segment a network node index falls in */
  findAnchorSegment: (networkIndex: number) => number;
  /** Insert a via-point by splitting a segment */
  insertViaNode: (afterAnchorIndex: number, nodeId: number) => void;
  /** Drop a via-point; the route's two ends stay. */
  removeViaNode: (anchorIndex: number) => void;
  /** Go back to the route before the last change, or drop the last point when there is no history. */
  undo: () => void;
  /** Reopen a route planned earlier (kept for guidance after the planner closed). */
  restoreRoute: (route: {
    direction: TaxiRouteDirection;
    anchorNodeIds: number[];
    nodeIds: number[];
    runway: string | null;
    source: GuidanceSource;
    standLink?: StandLinks;
  }) => void;
  removeLastWaypoint: () => void;
  removeLastNetworkNode: () => void;
  clearRoute: () => void;
  deactivate: () => void;
  setClickModeEnabled: (enabled: boolean) => void;
}

// ============================================================================
// Helpers
// ============================================================================

export interface StandLinks {
  from: StandLink | null;
  to: StandLink | null;
}

const NO_LINKS: StandLinks = { from: null, to: null };

/** A network route as undo restores it. */
export type RouteSnapshot = Pick<
  TaxiRouteState,
  | 'clickedNodeIds'
  | 'networkNodeIds'
  | 'autoRouteResult'
  | 'selectedRunway'
  | 'source'
  | 'standLink'
>;

const HISTORY_LIMIT = 30;

function snapshot(s: TaxiRouteState): RouteSnapshot {
  return {
    clickedNodeIds: s.clickedNodeIds,
    networkNodeIds: s.networkNodeIds,
    autoRouteResult: s.autoRouteResult,
    selectedRunway: s.selectedRunway,
    source: s.source,
    standLink: s.standLink,
  };
}

/** The history with the current route pushed on, for an action about to change it. */
function pushHistory(s: TaxiRouteState): RouteSnapshot[] {
  if (s.networkNodeIds.length === 0) return s.history;
  return [...s.history, snapshot(s)].slice(-HISTORY_LIMIT);
}

/**
 * The full route through the picked nodes, routing between each consecutive
 * pair, each leg carrying on from the way the last one arrived. `complete`
 * is false when some pair has no route between them; that leg is then a
 * straight line. `doublesBack` is true when the route comes through a node
 * twice: a picked point behind the route, or past its end, that it has to
 * taxi out to and back from.
 */
export function resolvePath(
  clickedIds: number[],
  graph: TaxiGraph | null,
  sizeCode: string | null = null
): { nodeIds: number[]; complete: boolean; doublesBack: boolean } {
  if (!graph || clickedIds.length === 0) return { nodeIds: [], complete: true, doublesBack: false };
  if (clickedIds.length === 1) {
    return { nodeIds: [clickedIds[0]!], complete: true, doublesBack: false };
  }

  let complete = true;

  const full: number[] = [];
  for (let i = 0; i < clickedIds.length - 1; i++) {
    const result = findPath(
      graph,
      clickedIds[i]!,
      clickedIds[i + 1]!,
      full.length >= 2 ? full[full.length - 2] : undefined,
      sizeCode
    );
    if (!result) {
      complete = false;
      if (full.length === 0) full.push(clickedIds[i]!);
      full.push(clickedIds[i + 1]!);
    } else {
      // Avoid duplicating the junction node
      const segment = i === 0 ? result.nodeIds : result.nodeIds.slice(1);
      full.push(...segment);
    }
  }

  return { nodeIds: full, complete, doublesBack: new Set(full).size !== full.length };
}

/**
 * Anchors for a route on to `nodeId`: the picked ones, less any the route
 * would have to taxi out to and back from. Picking a point behind the route
 * rewinds it to there instead of sending it there and back.
 */
export function anchorsOnTo(
  clicked: number[],
  nodeId: number,
  graph: TaxiGraph | null,
  sizeCode: string | null = null
): number[] {
  for (let keep = clicked.length; keep > 0; keep--) {
    const head = clicked.slice(0, keep);
    if (head[keep - 1] === nodeId) return head;
    const anchors = [...head, nodeId];
    if (!resolvePath(anchors, graph, sizeCode).doublesBack) return anchors;
  }
  return [nodeId];
}

/** Whether a route starting or ending at `nodeId` still meets the stand through its link point. */
export function linkMeets(
  graph: TaxiGraph | null,
  link: StandLink | null,
  nodeId: number
): boolean {
  return !!graph && !!link && pointOnEdgeAt(graph, link.lon, link.lat, nodeId);
}

/** `resolvePath`'s node IDs. */
export function resolveFullPath(
  clickedIds: number[],
  graph: TaxiGraph | null,
  sizeCode: string | null = null
): number[] {
  return resolvePath(clickedIds, graph, sizeCode).nodeIds;
}

// ============================================================================
// Store
// ============================================================================

export const useTaxiRouteStore = create<TaxiRouteState>()((set, get) => ({
  mode: 'network',
  direction: 'departure',
  waypoints: [],
  clickedNodeIds: [],
  networkNodeIds: [],
  graph: null,
  autoRouteResult: null,
  selectedRunway: null,
  source: 'planned',
  sizeCode: null,
  standLink: NO_LINKS,
  history: [],
  activeTaxiIcao: null,
  clickModeEnabled: false,

  setMode: (mode) =>
    set({
      mode,
      waypoints: [],
      clickedNodeIds: [],
      networkNodeIds: [],
      autoRouteResult: null,
      standLink: NO_LINKS,
      history: [],
    }),

  setDirection: (direction) =>
    set({
      direction,
      // Different flow has different endpoints — wipe the existing route
      // so the user gets a clean slate.
      clickedNodeIds: [],
      networkNodeIds: [],
      autoRouteResult: null,
      selectedRunway: null,
      standLink: NO_LINKS,
      history: [],
    }),

  setGraph: (graph) => set({ graph }),

  setSizeCode: (sizeCode) => set({ sizeCode }),

  setActiveAirport: (icao) =>
    set({
      activeTaxiIcao: icao.toUpperCase(),
      waypoints: [],
      clickedNodeIds: [],
      networkNodeIds: [],
      standLink: NO_LINKS,
      history: [],
      clickModeEnabled: true,
    }),

  addWaypoint: (lon, lat) =>
    set((state) => ({
      waypoints: [...state.waypoints, { longitude: lon, latitude: lat }],
    })),

  addNetworkNode: (nodeId) => {
    const { clickedNodeIds, graph, sizeCode, standLink } = get();
    const newClicked = anchorsOnTo(clickedNodeIds, nodeId, graph, sizeCode);
    set({
      history: pushHistory(get()),
      clickedNodeIds: newClicked,
      networkNodeIds: resolveFullPath(newClicked, graph, sizeCode),
      source: 'planned',
      standLink: { ...standLink, to: null },
    });
  },

  setAutoRoute: (result, runwayName, source) =>
    set((state) => ({
      history: pushHistory(state),
      mode: 'network',
      clickedNodeIds: [result.nodeIds[0]!, result.nodeIds[result.nodeIds.length - 1]!],
      networkNodeIds: result.nodeIds,
      autoRouteResult: result,
      selectedRunway: runwayName,
      source,
      standLink: { from: result.from ?? null, to: result.to ?? null },
    })),

  replaceNetworkNode: (anchorIndex, newNodeId) => {
    const { clickedNodeIds, graph, sizeCode, standLink } = get();
    if (anchorIndex < 0 || anchorIndex >= clickedNodeIds.length) return;
    const newClicked = [...clickedNodeIds];
    newClicked[anchorIndex] = newNodeId;
    set({
      history: pushHistory(get()),
      clickedNodeIds: newClicked,
      networkNodeIds: resolveFullPath(newClicked, graph, sizeCode),
      autoRouteResult: null, // summary invalidated
      source: 'planned',
      // A moved end keeps its stand only while it is still on the stand's taxiway.
      standLink: {
        from:
          anchorIndex === 0 && !linkMeets(graph, standLink.from, newNodeId) ? null : standLink.from,
        to:
          anchorIndex === clickedNodeIds.length - 1 && !linkMeets(graph, standLink.to, newNodeId)
            ? null
            : standLink.to,
      },
    });
  },

  findAnchorSegment: (networkIndex) => {
    const { clickedNodeIds, networkNodeIds } = get();
    if (clickedNodeIds.length < 2) return 0;
    // Walk through networkNodeIds and find which segment this index is in
    // by matching against clickedNodeIds boundaries
    let anchorIdx = 0;
    for (let i = 0; i < networkNodeIds.length && anchorIdx < clickedNodeIds.length - 1; i++) {
      if (networkNodeIds[i] === clickedNodeIds[anchorIdx + 1]) {
        if (i >= networkIndex) return anchorIdx;
        anchorIdx++;
      }
    }
    return Math.max(0, clickedNodeIds.length - 2);
  },

  insertViaNode: (afterAnchorIndex, nodeId) => {
    const { clickedNodeIds, graph, sizeCode } = get();
    if (afterAnchorIndex < 0 || afterAnchorIndex >= clickedNodeIds.length) return;
    const newClicked = [
      ...clickedNodeIds.slice(0, afterAnchorIndex + 1),
      nodeId,
      ...clickedNodeIds.slice(afterAnchorIndex + 1),
    ];
    set({
      history: pushHistory(get()),
      clickedNodeIds: newClicked,
      networkNodeIds: resolveFullPath(newClicked, graph, sizeCode),
      autoRouteResult: null,
      source: 'planned',
    });
  },

  removeViaNode: (anchorIndex) => {
    const { clickedNodeIds, graph, sizeCode } = get();
    if (anchorIndex <= 0 || anchorIndex >= clickedNodeIds.length - 1) return;
    const newClicked = clickedNodeIds.filter((_, i) => i !== anchorIndex);
    set({
      history: pushHistory(get()),
      clickedNodeIds: newClicked,
      networkNodeIds: resolveFullPath(newClicked, graph, sizeCode),
      autoRouteResult: null,
      source: 'planned',
    });
  },

  undo: () => {
    const { history } = get();
    const previous = history[history.length - 1];
    if (!previous) {
      // Nothing recorded (a restored route): step back one point, with no way to redo it.
      get().removeLastNetworkNode();
      set({ history: [] });
      return;
    }
    set({ ...previous, history: history.slice(0, -1) });
  },

  restoreRoute: ({ direction, anchorNodeIds, nodeIds, runway, source, standLink }) =>
    set((state) => ({
      mode: 'network',
      direction,
      clickedNodeIds: anchorNodeIds,
      networkNodeIds: nodeIds,
      autoRouteResult:
        state.graph && nodeIds.length >= 2 ? summarizePath(state.graph, nodeIds) : null,
      selectedRunway: runway,
      source,
      standLink: standLink ?? NO_LINKS,
      history: [],
    })),

  removeLastWaypoint: () =>
    set((state) => ({
      waypoints: state.waypoints.length > 0 ? state.waypoints.slice(0, -1) : state.waypoints,
    })),

  removeLastNetworkNode: () => {
    const { clickedNodeIds, graph, sizeCode, standLink } = get();
    if (clickedNodeIds.length === 0) return;
    const newClicked = clickedNodeIds.slice(0, -1);
    set({
      history: pushHistory(get()),
      clickedNodeIds: newClicked,
      networkNodeIds: resolveFullPath(newClicked, graph, sizeCode),
      source: 'planned',
      standLink: { from: newClicked.length > 0 ? standLink.from : null, to: null },
    });
  },

  clearRoute: () =>
    set({
      waypoints: [],
      clickedNodeIds: [],
      networkNodeIds: [],
      autoRouteResult: null,
      selectedRunway: null,
      standLink: NO_LINKS,
      history: [],
    }),

  deactivate: () =>
    set({
      activeTaxiIcao: null,
      waypoints: [],
      clickedNodeIds: [],
      networkNodeIds: [],
      autoRouteResult: null,
      selectedRunway: null,
      standLink: NO_LINKS,
      history: [],
      clickModeEnabled: false,
    }),

  setClickModeEnabled: (enabled) => set({ clickModeEnabled: enabled }),
}));

// ============================================================================
// Derived selectors
// ============================================================================

/** Whether taxi route mode is active. */
export function useTaxiModeActive(): boolean {
  return useTaxiRouteStore((s) => s.activeTaxiIcao !== null);
}
