import { describe, expect, it, vi } from 'vitest';
import type { SharedPlanDoc } from './sharedPlan';
import { registerSharedPlanIpc } from './sharedPlanIpc';

function registry() {
  const invoke = new Map<string, (event: unknown, ...args: unknown[]) => unknown>();
  const send = new Map<string, (event: unknown, ...args: unknown[]) => void>();
  const broadcast = vi.fn();
  registerSharedPlanIpc({
    handle: (channel, fn) => invoke.set(channel, fn),
    on: (channel, fn) => send.set(channel, fn),
    broadcast,
  });
  return {
    get: () => invoke.get('plan:get')!({}) as SharedPlanDoc | null,
    set: (doc: unknown) => send.get('plan:set')!({}, doc),
    broadcast,
  };
}

const doc = (origin: string, routeText: string): SharedPlanDoc => ({
  revision: 0,
  origin,
  map: {
    departure: null,
    arrival: null,
    route: [],
    cruiseAltitude: null,
    fmsData: null,
    fileName: null,
    simbriefData: null,
    showFlightPlanBar: false,
  },
  draft: {
    departure: null,
    arrival: null,
    alternate: null,
    aircraftClass: null,
    routeText,
    cruiseAltitudeFt: null,
  },
});

describe('registerSharedPlanIpc', () => {
  it('starts with no plan', () => {
    expect(registry().get()).toBeNull();
  });

  it('numbers each push and relays it to every window and tablet', () => {
    const r = registry();
    r.set(doc('desktop', 'A'));
    r.set(doc('tablet', 'B'));
    expect(r.get()).toMatchObject({ revision: 2, origin: 'tablet', draft: { routeText: 'B' } });
    expect(r.broadcast).toHaveBeenNthCalledWith(
      1,
      'plan:changed',
      expect.objectContaining({ revision: 1 })
    );
    expect(r.broadcast).toHaveBeenNthCalledWith(
      2,
      'plan:changed',
      expect.objectContaining({ revision: 2 })
    );
  });

  it('drops anything that is not a plan document', () => {
    const r = registry();
    r.set(doc('desktop', 'A'));
    r.set(null);
    r.set({ origin: 'x' });
    r.set({ ...doc('tablet', 'B'), map: { route: 'nope' } });
    expect(r.get()).toMatchObject({ revision: 1, draft: { routeText: 'A' } });
    expect(r.broadcast).toHaveBeenCalledTimes(1);
  });
});
