import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { DraftSnapshot, MapPlanSnapshot, SharedPlanDoc } from './sharedPlan';
import { type SharedPlanSide, createSharedPlanSync } from './sharedPlanSync';

const EMPTY_MAP: MapPlanSnapshot = {
  departure: null,
  arrival: null,
  route: [],
  cruiseAltitude: null,
  fmsData: null,
  fileName: null,
  simbriefData: null,
  showFlightPlanBar: false,
};
const EMPTY_DRAFT: DraftSnapshot = {
  departure: null,
  arrival: null,
  alternate: null,
  aircraftClass: null,
  routeText: '',
  cruiseAltitudeFt: null,
};
const LFPG = { icao: 'LFPG', latitude: 49, longitude: 2.5 };

/** A store stand-in: `apply` writes, every write wakes the subscribers. */
function side<T extends object>(initial: T) {
  let value = initial;
  const listeners = new Set<() => void>();
  const applied: T[] = [];
  const s: SharedPlanSide<T> & { set(next: T): void; applied: T[] } = {
    read: () => value,
    apply: (next) => {
      applied.push(next);
      s.set(next);
    },
    subscribe: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    set: (next) => {
      value = next;
      listeners.forEach((l) => l());
    },
    applied,
  };
  return s;
}

function harness(initialDoc: SharedPlanDoc | null = null) {
  const map = side(EMPTY_MAP);
  const draft = side(EMPTY_DRAFT);
  let changed: ((doc: SharedPlanDoc) => void) | null = null;
  const pushed: SharedPlanDoc[] = [];
  let stored = initialDoc;
  const api = {
    get: vi.fn(async () => stored),
    set: vi.fn((doc: SharedPlanDoc) => {
      pushed.push(doc);
      stored = { ...doc, revision: pushed.length };
    }),
    onChanged: vi.fn((cb: (doc: SharedPlanDoc) => void) => {
      changed = cb;
      return () => {
        changed = null;
      };
    }),
  };
  const sync = createSharedPlanSync({ origin: 'me', map, draft, api, debounceMs: 100 });
  const remote = (doc: SharedPlanDoc) => changed?.(doc);
  return { map, draft, api, pushed, sync, remote };
}

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe('createSharedPlanSync', () => {
  it('seeds main with the local plan when main has none yet', async () => {
    const h = harness();
    h.draft.set({ ...EMPTY_DRAFT, departure: LFPG });
    await h.sync.start();
    expect(h.pushed).toHaveLength(1);
    expect(h.pushed[0]).toMatchObject({ origin: 'me', draft: { departure: LFPG } });
  });

  it('applies the plan main already holds instead of pushing its own', async () => {
    const h = harness({
      revision: 3,
      origin: 'tablet',
      map: { ...EMPTY_MAP, fileName: 'LFPG-EGLL', showFlightPlanBar: true },
      draft: { ...EMPTY_DRAFT, departure: LFPG, routeText: 'ABC' },
    });
    await h.sync.start();
    expect(h.pushed).toHaveLength(0);
    expect(h.map.read().fileName).toBe('LFPG-EGLL');
    expect(h.draft.read().routeText).toBe('ABC');
  });

  it('pushes a local edit once the typing pauses', async () => {
    const h = harness();
    await h.sync.start();
    h.pushed.length = 0;
    h.draft.set({ ...EMPTY_DRAFT, routeText: 'A' });
    h.draft.set({ ...EMPTY_DRAFT, routeText: 'AB' });
    h.draft.set({ ...EMPTY_DRAFT, routeText: 'ABC' });
    expect(h.pushed).toHaveLength(0);
    await vi.advanceTimersByTimeAsync(100);
    expect(h.pushed).toHaveLength(1);
    expect(h.pushed[0]!.draft.routeText).toBe('ABC');
  });

  it('ignores store changes that leave the plan as it was', async () => {
    const h = harness();
    await h.sync.start();
    h.pushed.length = 0;
    h.map.set({ ...h.map.read() });
    await vi.advanceTimersByTimeAsync(100);
    expect(h.pushed).toHaveLength(0);
  });

  it('applies another device’s edit without pushing it back', async () => {
    const h = harness();
    await h.sync.start();
    h.pushed.length = 0;
    h.remote({
      revision: 2,
      origin: 'tablet',
      map: EMPTY_MAP,
      draft: { ...EMPTY_DRAFT, routeText: 'FROM TABLET' },
    });
    expect(h.draft.read().routeText).toBe('FROM TABLET');
    expect(h.map.applied).toHaveLength(0);
    await vi.advanceTimersByTimeAsync(100);
    expect(h.pushed).toHaveLength(0);
  });

  it('does not push a copy of the same plan rebuilt by the planner', async () => {
    const h = harness();
    await h.sync.start();
    h.pushed.length = 0;
    h.remote({
      revision: 2,
      origin: 'tablet',
      map: EMPTY_MAP,
      draft: { ...EMPTY_DRAFT, departure: { ...LFPG, runway: '09L' } },
    });
    // The planner rewrites the endpoint object once the airport data loads.
    h.draft.set({ ...h.draft.read(), departure: { ...LFPG, runway: '09L' } });
    await vi.advanceTimersByTimeAsync(100);
    expect(h.pushed).toHaveLength(0);
  });

  it('skips its own echo and anything older than what it has seen', async () => {
    const h = harness();
    await h.sync.start();
    h.remote({
      revision: 5,
      origin: 'tablet',
      map: EMPTY_MAP,
      draft: { ...EMPTY_DRAFT, routeText: 'NEW' },
    });
    h.remote({
      revision: 4,
      origin: 'tablet',
      map: EMPTY_MAP,
      draft: { ...EMPTY_DRAFT, routeText: 'OLD' },
    });
    h.remote({
      revision: 6,
      origin: 'me',
      map: EMPTY_MAP,
      draft: { ...EMPTY_DRAFT, routeText: 'ECHO' },
    });
    expect(h.draft.read().routeText).toBe('NEW');
  });

  it('fetches again after a reconnect and applies what changed meanwhile', async () => {
    const h = harness();
    await h.sync.start();
    h.api.get.mockResolvedValueOnce({
      revision: 9,
      origin: 'desktop',
      map: { ...EMPTY_MAP, fileName: 'EGLL-LFPG', showFlightPlanBar: true },
      draft: EMPTY_DRAFT,
    });
    await h.sync.resync();
    expect(h.map.read().fileName).toBe('EGLL-LFPG');
  });

  it('takes the plan of a restarted desktop even though its numbering starts over', async () => {
    const h = harness();
    await h.sync.start();
    h.remote({
      revision: 87,
      origin: 'desktop',
      map: EMPTY_MAP,
      draft: { ...EMPTY_DRAFT, routeText: 'OLD' },
    });
    h.api.get.mockResolvedValueOnce({
      revision: 1,
      origin: 'desktop',
      map: EMPTY_MAP,
      draft: { ...EMPTY_DRAFT, routeText: 'AFTER RESTART' },
    });
    await h.sync.resync();
    expect(h.draft.read().routeText).toBe('AFTER RESTART');
  });

  it('stops listening and drops a pending push', async () => {
    const h = harness();
    await h.sync.start();
    h.pushed.length = 0;
    h.draft.set({ ...EMPTY_DRAFT, routeText: 'X' });
    h.sync.stop();
    await vi.advanceTimersByTimeAsync(100);
    h.draft.set({ ...EMPTY_DRAFT, routeText: 'Y' });
    await vi.advanceTimersByTimeAsync(100);
    expect(h.pushed).toHaveLength(0);
  });
});
