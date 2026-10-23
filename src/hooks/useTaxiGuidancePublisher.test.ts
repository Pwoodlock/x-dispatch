import { describe, expect, it } from 'vitest';
import type { TaxiGraph } from '@/lib/taxiGraph';
import type { GuidanceRoute } from '@/lib/taxiGuidance';
import { useTaxiRouteStore } from '@/stores/taxiRouteStore';
import type { StartPosition } from '@/types/position';
import { departureLeftBehind, guidanceSyncAction } from './useTaxiGuidancePublisher';

type PlannerState = ReturnType<typeof useTaxiRouteStore.getState>;

const graph = {
  adjacency: new Map(),
  againstOneway: new Map(),
  nodes: new Map(),
  nodeList: [],
} as TaxiGraph;
const base: PlannerState = {
  ...useTaxiRouteStore.getState(),
  mode: 'network',
  direction: 'departure',
  graph,
  activeTaxiIcao: 'LFBO',
  networkNodeIds: [1, 2, 3],
};

describe('guidanceSyncAction', () => {
  it('publishes a planned network route', () => {
    const prev = { ...base, networkNodeIds: [] };
    expect(guidanceSyncAction(prev, base)).toEqual({ type: 'publish' });
  });

  it('publishes again when the pilot takes over a suggested route', () => {
    expect(guidanceSyncAction({ ...base, source: 'auto' }, base)).toEqual({ type: 'publish' });
  });

  it('ignores changes that do not touch the route', () => {
    expect(guidanceSyncAction(base, { ...base, clickModeEnabled: false })).toBeNull();
  });

  it('clears the route when the pilot clears it in the planner', () => {
    expect(guidanceSyncAction(base, { ...base, networkNodeIds: [] })).toEqual({
      type: 'clear',
      direction: 'departure',
    });
  });

  it('keeps the route when the planner closes', () => {
    const closed = { ...base, activeTaxiIcao: null, networkNodeIds: [] };
    expect(guidanceSyncAction(base, closed)).toBeNull();
  });

  it('keeps the departure route when the pilot switches to planning the arrival', () => {
    const arrival = { ...base, direction: 'arrival' as const, networkNodeIds: [] };
    expect(guidanceSyncAction(base, arrival)).toBeNull();
  });
});

describe('departureLeftBehind', () => {
  const route = { icao: 'GCHI', gateName: '4' } as GuidanceRoute;
  const start = (name: string, airport = 'GCHI') => ({ name, airport }) as StartPosition;

  it('drops the departure route when the pilot starts somewhere else at that airport', () => {
    expect(departureLeftBehind(route, start('H1'))).toBe(true);
    expect(departureLeftBehind(route, start('H1', 'gchi'))).toBe(true);
  });

  it('keeps it while the start is still its gate', () => {
    expect(departureLeftBehind(route, start('4'))).toBe(false);
  });

  it('keeps it when the start is cleared or at another airport', () => {
    expect(departureLeftBehind(route, null)).toBe(false);
    expect(departureLeftBehind(route, start('H1', 'GCLA'))).toBe(false);
    expect(departureLeftBehind(null, start('H1'))).toBe(false);
  });
});
