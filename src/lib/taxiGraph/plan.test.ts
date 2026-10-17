import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { AirportParser } from '@/lib/parsers/apt';
import type { TaxiEdge, TaxiNetwork } from '@/types/apt';
import {
  buildTaxiGraph,
  findNearestEdge,
  findPath,
  planArrival,
  planDeparture,
  pointOnEdgeAt,
} from '.';
import { turnDeg } from './geo';
import { edgeBetween } from './search';
import type { TaxiGraph } from './types';

/** GOBD from the X-Plane Scenery Gateway, trimmed to runways, stands and the taxi network. */
const gobd = new AirportParser(
  readFileSync(resolve(__dirname, '__fixtures__/GOBD.dat'), 'utf8')
).parse().data;
const graph = buildTaxiGraph(gobd.taxiNetwork!);
const stands = gobd.startupLocations.map((s) => ({
  name: s.name,
  lat: s.latitude,
  lon: s.longitude,
}));
const stand = (name: string) => stands.find((s) => s.name === name)!;

function edgesOf(g: TaxiGraph, nodeIds: number[]) {
  return nodeIds.slice(1).map((id, i) => edgeBetween(g, nodeIds[i]!, id)!);
}

function sharpestTurn(g: TaxiGraph, nodeIds: number[]): number {
  const bearings = edgesOf(g, nodeIds)
    .map((e) => e.bearing)
    .filter((b) => !Number.isNaN(b));
  let max = 0;
  for (let i = 1; i < bearings.length; i++)
    max = Math.max(max, turnDeg(bearings[i - 1]!, bearings[i]!));
  return max;
}

describe('planDeparture at GOBD', () => {
  it('stops at a hold line next to the 01 end instead of backtracking the runway', () => {
    const route = planDeparture(graph, gobd.runways, stand('1'), '01')!;
    // C7 and C8 both join the runway 78 m from the 01 end; 69 and 36 are their hold lines.
    expect([69, 36]).toContain(route.nodeIds.at(-1));
    expect(edgesOf(graph, route.nodeIds).some((e) => e.edge.widthClass === 'runway')).toBe(false);
  });

  it('stops at a hold line next to the 19 end', () => {
    const route = planDeparture(graph, gobd.runways, stand('1'), '19')!;
    // C1 (hold 25) and M (hold 50) are the entries at the 19 end.
    expect([25, 50]).toContain(route.nodeIds.at(-1));
  });

  it('never taxis along the runway, ends clear of it and turns no sharper than 120°, from any stand', () => {
    for (const s of stands) {
      for (const rwy of ['01', '19']) {
        const route = planDeparture(graph, gobd.runways, s, rwy);
        expect(route, `${s.name} → ${rwy}`).not.toBeNull();
        const edges = edgesOf(graph, route!.nodeIds);
        expect(edges.some((e) => e.edge.widthClass === 'runway')).toBe(false);
        // A stand next to its hold line has a route of one node, reached from the stand.
        if (edges.length === 0) expect(route!.from).toBeDefined();
        else
          expect(edges.at(-1)!.edge.activeZones?.some((z) => z.type !== 'ils') ?? false).toBe(
            false
          );
        expect(sharpestTurn(graph, route!.nodeIds)).toBeLessThanOrEqual(120);
      }
    }
  });

  it('crosses the runway once from the cargo apron to reach the far end', () => {
    // The cargo stands are west of the runway and every 19 hold line is east of it.
    const route = planDeparture(graph, gobd.runways, stand('V1 (Cargo)'), '19')!;
    const names = edgesOf(graph, route.nodeIds).map((e) => e.edge.name);
    expect(names).toContain('C8');
    expect(names).toContain('C7');
    expect([25, 50]).toContain(route.nodeIds.at(-1));
  });
});

describe('stand links', () => {
  // A stand 30 m north of the middle of a 300 m taxilane 1-2, which leads on to a runway at 3.
  const g = buildTaxiGraph(
    network({ 1: [0, 0], 2: [300, 0], 3: [300, -200] }, [
      [1, 2, { name: 'W' }],
      [2, 3, { name: 'K' }],
    ])
  );
  const deg = 1 / 111_320;
  const stand = { lat: 30 * deg, lon: 150 * deg };
  // Runway 09/27 runs east from 200 m to 400 m, 200 m south; node 3 sits on it.
  const runways = [
    {
      width: 45,
      ends: [
        { name: '09', latitude: -200 * deg, longitude: 200 * deg, dthr_length: 0 },
        { name: '27', latitude: -200 * deg, longitude: 400 * deg, dthr_length: 0 },
      ],
    },
  ] as unknown as Parameters<typeof planDeparture>[1];

  it('starts a departure abeam the stand, not at the next node', () => {
    const route = planDeparture(g, runways, stand, '09')!;
    // Node 2 is the hold line before the runway.
    expect(route.nodeIds).toEqual([2]);
    expect(route.from!.lon / deg).toBeCloseTo(150, 0);
    expect(route.from!.lat).toBeCloseTo(0, 6);
    expect(route.from!.name).toBe('W');
    expect(route.totalDistance).toBeCloseTo(150, 0);
  });

  it('ends an arrival abeam the stand', () => {
    const route = planArrival(g, runways, '09', stand)!;
    expect(route.nodeIds).toEqual([3, 2]);
    expect(route.to!.lon / deg).toBeCloseTo(150, 0);
    expect(route.to!.name).toBe('W');
  });
});

describe('planArrival at GOBD', () => {
  it('starts at an exit past the rollout, not at either runway end', () => {
    const route = planArrival(graph, gobd.runways, '01', stand('1'))!;
    const [first, second] = edgesOf(graph, route.nodeIds);
    // Node 58 (C4) is the first exit 1300 m past the 01 end that turns off at a usable angle.
    expect(route.nodeIds[0]).toBe(58);
    expect(first!.edge.name).toBe('C4');
    expect(second!.edge.widthClass).not.toBe('runway');
  });

  it('turns off the runway at no more than a right angle and a bit', () => {
    for (const rwy of ['01', '19']) {
      const route = planArrival(graph, gobd.runways, rwy, stand('23B'))!;
      const rwyHeading = rwy === '01' ? 0 : 180;
      const [first] = edgesOf(graph, route.nodeIds);
      expect(turnDeg(rwyHeading, first!.bearing)).toBeLessThanOrEqual(120);
    }
  });
});

/** A small network laid out in metres east (x) and north (y) of 0°, 0°. */
function network(
  nodes: Record<number, [number, number]>,
  edges: [number, number, Partial<TaxiEdge>?][]
): TaxiNetwork {
  const deg = 1 / 111_320;
  return {
    nodes: Object.entries(nodes).map(([id, [x, y]]) => ({
      id: Number(id),
      latitude: y * deg,
      longitude: x * deg,
      usage: 'both',
    })),
    edges: edges.map(([from, to, extra]) => ({
      fromNodeId: from,
      toNodeId: to,
      direction: 'twoway',
      widthClass: 'E',
      name: 'A',
      ...extra,
    })),
  } as TaxiNetwork;
}

describe('findPath', () => {
  it('reports the real distance even when the route has to use a runway', () => {
    const g = buildTaxiGraph(
      network({ 1: [0, 0], 2: [100, 0], 3: [200, 0] }, [
        [1, 2],
        [2, 3, { widthClass: 'runway', name: '09/27' }],
      ])
    );
    const route = findPath(g, 1, 3)!;
    expect(route.nodeIds).toEqual([1, 2, 3]);
    expect(route.totalDistance).toBeCloseTo(200, 0);
  });

  it('carries on from the way it arrived rather than doubling back', () => {
    // A straight taxiway 1-2-3 with a loop 2-4-5-3 beside it. Arriving at 2
    // from 3, going back to 3 means a U-turn; the loop avoids it.
    const g = buildTaxiGraph(
      network({ 1: [0, 0], 2: [100, 0], 3: [200, 0], 4: [60, 60], 5: [240, 60] }, [
        [1, 2],
        [2, 3],
        [2, 4],
        [4, 5],
        [5, 3],
      ])
    );
    expect(findPath(g, 2, 3)!.nodeIds).toEqual([2, 3]);
    expect(findPath(g, 2, 3, 3)!.nodeIds).toEqual([2, 4, 5, 3]);
  });

  it('still finds a route when a U-turn is the only way', () => {
    const g = buildTaxiGraph(network({ 1: [0, 0], 2: [100, 0] }, [[1, 2]]));
    expect(findPath(g, 2, 1, 1)!.nodeIds).toEqual([2, 1]);
  });

  it('keeps to taxiways wide enough for the aircraft while one fits', () => {
    // A short code B taxiway 1-2-3, and a longer code E way round through 4.
    const g = buildTaxiGraph(
      network({ 1: [0, 0], 2: [100, 0], 3: [200, 0], 4: [100, 80] }, [
        [1, 2, { widthClass: 'B' }],
        [2, 3, { widthClass: 'B' }],
        [1, 4],
        [4, 3],
      ])
    );
    expect(findPath(g, 1, 3)!.nodeIds).toEqual([1, 2, 3]);
    expect(findPath(g, 1, 3, undefined, 'B')!.nodeIds).toEqual([1, 2, 3]);
    expect(findPath(g, 1, 3, undefined, 'D')!.nodeIds).toEqual([1, 4, 3]);
    // Nothing fits an F: the route still comes, along the shortest way.
    expect(findPath(g, 1, 3, undefined, 'F')!.nodeIds).toEqual([1, 2, 3]);
  });

  it('keeps to one-way edges', () => {
    const g = buildTaxiGraph(
      network({ 1: [0, 0], 2: [100, 0], 3: [50, 50] }, [
        [1, 2, { direction: 'oneway' }],
        [2, 3],
        [3, 1],
      ])
    );
    expect(findPath(g, 2, 1)!.nodeIds).toEqual([2, 3, 1]);
  });
});

describe('findNearestEdge', () => {
  it('puts the cursor on the taxiway centreline and picks the nearer node', () => {
    const deg = 1 / 111_320;
    const g = buildTaxiGraph(network({ 1: [0, 0], 2: [100, 0] }, [[1, 2, { name: 'C7' }]]));
    const snap = findNearestEdge(g, 70 * deg, 12 * deg)!;
    expect(snap.lon / deg).toBeCloseTo(70, 3);
    expect(snap.lat).toBeCloseTo(0, 9);
    expect(snap.name).toBe('C7');
    expect(snap.nodeId).toBe(2);
    expect(snap.distance).toBeCloseTo(12, 0);
  });

  it('keeps to the edges whose both ends pass the filter', () => {
    const deg = 1 / 111_320;
    // Taxiway 1-2 with a parallel 3-4 closer to the cursor.
    const g = buildTaxiGraph(
      network({ 1: [0, 0], 2: [100, 0], 3: [0, 30], 4: [100, 30] }, [
        [1, 2],
        [3, 4],
      ])
    );
    expect(findNearestEdge(g, 50 * deg, 20 * deg)!.nodeId).toBe(4);
    const onRoute = new Set([1, 2]);
    const snap = findNearestEdge(g, 50 * deg, 20 * deg, (id) => onRoute.has(id))!;
    expect(snap.nodeId).toBe(2);
    expect(snap.distance).toBeCloseTo(20, 0);
  });
});

describe('pointOnEdgeAt', () => {
  it('tells whether a point sits on a taxiway ending at the node', () => {
    const deg = 1 / 111_320;
    const g = buildTaxiGraph(
      network({ 1: [0, 0], 2: [100, 0], 3: [200, 0] }, [
        [1, 2],
        [2, 3],
      ])
    );
    expect(pointOnEdgeAt(g, 50 * deg, 0, 1)).toBe(true);
    expect(pointOnEdgeAt(g, 50 * deg, 0, 2)).toBe(true);
    expect(pointOnEdgeAt(g, 50 * deg, 0, 3)).toBe(false);
    expect(pointOnEdgeAt(g, 50 * deg, 5 * deg, 1)).toBe(false);
  });
});
