import { beforeEach, describe, expect, it } from 'vitest';
import { buildTaxiGraph } from '@/lib/taxiGraph';
import type { TaxiNetwork } from '@/types/apt';
import { resolvePath, useTaxiRouteStore } from './taxiRouteStore';

const deg = 1 / 111_320;

/** A square of taxiway 1-2-3-4 with a lone node 5 off to the side. */
const graph = buildTaxiGraph({
  nodes: [
    [1, 0, 0],
    [2, 100, 0],
    [3, 100, 100],
    [4, 0, 100],
    [5, 500, 500],
  ].map(([id, x, y]) => ({ id: id!, latitude: y! * deg, longitude: x! * deg, usage: 'both' })),
  edges: [
    [1, 2],
    [2, 3],
    [3, 4],
    [4, 1],
  ].map(([from, to]) => ({
    fromNodeId: from!,
    toNodeId: to!,
    direction: 'twoway',
    widthClass: 'E',
    name: 'A',
  })),
} as unknown as TaxiNetwork);

beforeEach(() => {
  useTaxiRouteStore.getState().deactivate();
  useTaxiRouteStore.getState().setGraph(graph);
  useTaxiRouteStore.getState().setActiveAirport('TEST');
});

describe('resolvePath', () => {
  it('reports a leg with no way through', () => {
    expect(resolvePath([1, 3], graph).complete).toBe(true);
    const cut = resolvePath([1, 5], graph);
    expect(cut.complete).toBe(false);
    expect(cut.nodeIds).toEqual([1, 5]);
  });

  it('keeps a via-point the route has to come back from', () => {
    // Out to 2 and on round the square to 1 again: nothing is cut away.
    expect(resolvePath([1, 2, 1], graph).nodeIds).toEqual([1, 2, 3, 4, 1]);
  });
});

describe('route editing', () => {
  it('drops a via-point but never an end', () => {
    const store = useTaxiRouteStore.getState();
    store.addNetworkNode(1);
    store.addNetworkNode(2);
    store.addNetworkNode(3);
    store.removeViaNode(0);
    store.removeViaNode(2);
    expect(useTaxiRouteStore.getState().clickedNodeIds).toEqual([1, 2, 3]);
    store.removeViaNode(1);
    expect(useTaxiRouteStore.getState().clickedNodeIds).toEqual([1, 3]);
  });

  it('undoes each change in turn', () => {
    const store = useTaxiRouteStore.getState();
    store.addNetworkNode(1);
    store.addNetworkNode(3);
    store.insertViaNode(0, 4);
    expect(useTaxiRouteStore.getState().clickedNodeIds).toEqual([1, 4, 3]);
    store.undo();
    expect(useTaxiRouteStore.getState().clickedNodeIds).toEqual([1, 3]);
    store.undo();
    expect(useTaxiRouteStore.getState().clickedNodeIds).toEqual([1]);
  });

  it('forgets the stand an end met once that end is moved', () => {
    const store = useTaxiRouteStore.getState();
    const from = { lat: 0, lon: 50 * deg, name: 'A' };
    store.setAutoRoute(
      { nodeIds: [2, 3], totalDistance: 150, taxiwayNames: [], from },
      '09',
      'auto'
    );
    store.replaceNetworkNode(1, 4);
    expect(useTaxiRouteStore.getState().standLink.from).toEqual(from);
    store.replaceNetworkNode(0, 1);
    expect(useTaxiRouteStore.getState().standLink.from).toBeNull();
    store.undo();
    store.undo();
    expect(useTaxiRouteStore.getState().standLink.from).toEqual(from);
  });
});
