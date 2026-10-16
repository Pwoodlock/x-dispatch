import { describe, expect, it } from 'vitest';
import type { NetworkPilot } from '@/types/networkTraffic';
import { flightProgress } from './progress';

const EGLL = { latitude: 51.4706, longitude: -0.4619 };
const LFPG = { latitude: 49.0097, longitude: 2.5479 };

function pilot(over: Partial<NetworkPilot>): NetworkPilot {
  return {
    network: 'vatsim',
    id: 1,
    callsign: 'BAW12',
    name: '',
    latitude: 50.3,
    longitude: 1.0,
    altitudeFt: 35000,
    groundspeedKts: 450,
    headingDeg: 130,
    transponder: null,
    onGround: false,
    flightPlan: {
      flightRules: 'IFR',
      aircraft: 'A320',
      departure: 'EGLL',
      arrival: 'LFPG',
      alternate: null,
      cruiseAltitudeFt: 35000,
      route: '',
    },
    ...over,
  };
}

describe('flightProgress', () => {
  it('reads cruising with distances and a percent along the pair', () => {
    const p = flightProgress(pilot({}), EGLL, LFPG);
    expect(p.phase).toBe('cruising');
    expect(p.flownNm).toBeGreaterThan(80);
    expect(p.remainingNm).toBeGreaterThan(80);
    expect(p.percent).toBeGreaterThan(40);
    expect(p.percent).toBeLessThan(60);
  });
  it('is departing on the ground at the departure airport', () => {
    const p = flightProgress(pilot({ ...EGLL, onGround: true, altitudeFt: 80 }), EGLL, LFPG);
    expect(p.phase).toBe('departing');
    expect(p.percent).toBe(0);
  });
  it('is arrived on the ground at the arrival airport', () => {
    const p = flightProgress(pilot({ ...LFPG, onGround: true, altitudeFt: 400 }), EGLL, LFPG);
    expect(p.phase).toBe('arrived');
    expect(p.percent).toBe(100);
  });
  it('is departed just after take-off and arriving near the destination', () => {
    const near = { latitude: 51.3, longitude: 0.1, altitudeFt: 6000 };
    expect(flightProgress(pilot(near), EGLL, LFPG).phase).toBe('departed');
    const close = { latitude: 49.3, longitude: 2.2, altitudeFt: 5000 };
    expect(flightProgress(pilot(close), EGLL, LFPG).phase).toBe('arriving');
  });
  it('splits climb and descent at the midpoint when below cruise', () => {
    const early = { latitude: 50.9, longitude: 0.4, altitudeFt: 20000 };
    expect(flightProgress(pilot(early), EGLL, LFPG).phase).toBe('climbing');
    const late = { latitude: 49.6, longitude: 1.9, altitudeFt: 20000 };
    expect(flightProgress(pilot(late), EGLL, LFPG).phase).toBe('descending');
  });
  it('is unknown without airports and keeps distances null', () => {
    const p = flightProgress(pilot({ altitudeFt: 20000 }), null, null);
    expect(p).toEqual({ phase: 'unknown', flownNm: null, remainingNm: null, percent: null });
  });
  it('still shows cruising with only the cruise altitude to go on', () => {
    expect(flightProgress(pilot({}), null, null).phase).toBe('cruising');
  });
});
