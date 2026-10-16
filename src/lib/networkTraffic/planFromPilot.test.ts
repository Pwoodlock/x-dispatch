import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Airport } from '@/lib/xplaneServices/dataService';
import { usePlanBuilderStore } from '@/stores/planBuilderStore';
import type { NetworkPilot } from '@/types/networkTraffic';
import { canPlanFromPilot, openPlannerForPilot } from './planFromPilot';

// electron-log's renderer transport waits for the main process, which a node test never has.
vi.mock('@/lib/utils/loggerRenderer', () => {
  const scope = { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() };
  return { default: new Proxy({}, { get: () => scope }) };
});

const airports = [
  { icao: 'EGLL', name: 'London Heathrow', lat: 51.4706, lon: -0.4619 },
  { icao: 'LFPG', name: 'Paris Charles de Gaulle', lat: 49.0097, lon: 2.5479 },
] as Airport[];

const pilot: NetworkPilot = {
  network: 'vatsim',
  id: 1,
  callsign: 'BAW12',
  name: '',
  latitude: 50,
  longitude: 1,
  altitudeFt: 30000,
  groundspeedKts: 440,
  headingDeg: 130,
  transponder: null,
  onGround: false,
  flightPlan: {
    flightRules: 'IFR',
    aircraft: 'A320',
    departure: 'EGLL',
    arrival: 'LFPG',
    alternate: 'LFPO',
    cruiseAltitudeFt: 35000,
    route: 'DET L6 DVR UL9 KONAN',
  },
};

describe('openPlannerForPilot', () => {
  beforeEach(() => {
    usePlanBuilderStore.getState().reset();
    usePlanBuilderStore.getState().close();
  });

  it('fills departure, arrival, route and cruise, then opens the planner', () => {
    expect(openPlannerForPilot(airports, pilot)).toBe(true);
    const s = usePlanBuilderStore.getState();
    expect(s.departure?.icao).toBe('EGLL');
    expect(s.arrival?.icao).toBe('LFPG');
    expect(s.routeText).toBe('DET L6 DVR UL9 KONAN');
    expect(s.cruiseAltitudeFt).toBe(35000);
    expect(s.isOpen).toBe(true);
    expect(s.routeSource).toBe('vatsim');
  });

  it('leaves the planner alone when an airport is not in the database', () => {
    const elsewhere = { ...pilot, flightPlan: { ...pilot.flightPlan!, arrival: 'ZZZZ' } };
    expect(canPlanFromPilot(airports, elsewhere)).toBe(false);
    expect(openPlannerForPilot(airports, elsewhere)).toBe(false);
    expect(usePlanBuilderStore.getState().isOpen).toBe(false);
    expect(usePlanBuilderStore.getState().departure).toBeNull();
  });

  it('needs a filed plan', () => {
    expect(canPlanFromPilot(airports, { ...pilot, flightPlan: null })).toBe(false);
  });
});
