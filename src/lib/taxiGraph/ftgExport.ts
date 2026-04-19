import { useAppStore } from '@/stores/appStore';
import { useLaunchStore } from '@/stores/launchStore';
import { useTaxiRouteStore } from '@/stores/taxiRouteStore';
import { version } from '../../../package.json';

export interface FtgRoutePayload {
  apt: string;
  mode: 'departure' | 'arrival';
  start: string;
  dest: string;
  route: number[];
  taxiway_names: string[];
  distance_m: number;
  gate_heading: number;
  aircraft_icao: string;
  timestamp: string;
  'apt.dat': string;
  'x-dispatch-version': string;
}

export function buildFtgPayload(opts: {
  icao: string;
  mode: 'departure' | 'arrival';
  startName: string;
  destName: string;
  nodeIds: number[];
  taxiwayNames: string[];
  distanceM: number;
  gateHeading: number;
  aircraftIcao: string;
  aptDatPath: string;
}): FtgRoutePayload {
  // Deduplicate consecutive taxiway names
  const names: string[] = [];
  for (const n of opts.taxiwayNames) {
    if (n && n !== names[names.length - 1]) names.push(n);
  }

  return {
    apt: opts.icao,
    mode: opts.mode,
    start: opts.startName,
    dest: opts.destName,
    route: opts.nodeIds,
    taxiway_names: names,
    distance_m: Math.round(opts.distanceM),
    gate_heading: Math.round(opts.gateHeading),
    aircraft_icao: opts.aircraftIcao,
    timestamp: new Date().toISOString(),
    'apt.dat': opts.aptDatPath,
    'x-dispatch-version': version,
  };
}

/**
 * Write the current taxi route to the FTG route file.
 * Reads from taxiRouteStore and appStore. Returns the write result,
 * or null if no valid route exists.
 */
export async function writeFtgRoute(): Promise<{
  success: boolean;
  path?: string;
  error?: string;
} | null> {
  const taxi = useTaxiRouteStore.getState();
  if (taxi.mode !== 'network' || taxi.networkNodeIds.length < 2) return null;

  const app = useAppStore.getState();
  const icao = app.selectedICAO ?? '';
  const airport = app.selectedAirportData;
  const startPos = app.startPosition;
  const aircraft = useLaunchStore.getState().selectedAircraft;

  // Compute taxiway names and distance from the graph edges directly,
  // since autoRouteResult may be null after drag-to-reroute edits.
  const nodeIds = taxi.networkNodeIds;
  const taxiwayNames: string[] = [];
  let totalDistance = 0;

  if (taxi.graph) {
    for (let i = 0; i < nodeIds.length - 1; i++) {
      const neighbors = taxi.graph.adjacency.get(nodeIds[i]!);
      const edge = neighbors?.find((e) => e.toNodeId === nodeIds[i + 1]!);
      if (edge) {
        totalDistance += edge.distance;
        taxiwayNames.push(edge.edge.name);
      }
    }
  }

  const payload = buildFtgPayload({
    icao,
    mode: 'departure',
    startName: startPos?.name ?? String(nodeIds[0]),
    destName: taxi.selectedRunway ?? '',
    nodeIds,
    taxiwayNames,
    distanceM: totalDistance,
    gateHeading: startPos?.heading ?? 0,
    aircraftIcao: aircraft?.icao ?? '',
    aptDatPath: airport?.sourceFile ?? '',
  });

  return window.xplaneAPI.writeTaxiRoute(JSON.stringify(payload, null, 2));
}
