import { describe, expect, it } from 'vitest';
import type { FlightSummary, LandingReport } from '@/types/flightRecorder';
import { applyFlightEdit, flightEditInput, logbookTotals, newManualFlight } from './flightEdit';

function summary(overrides: Partial<FlightSummary> = {}): FlightSummary {
  return {
    id: 'f1',
    startedAt: 1_700_000_000_000,
    endedAt: 1_700_003_600_000,
    status: 'complete',
    aircraft: { icao: 'A320', name: 'Airbus A320', livery: 'Lufthansa' },
    departure: { icao: 'EDDF', name: 'Frankfurt' },
    arrival: { icao: 'EGLL', name: 'Heathrow' },
    blockTimeSec: 3600,
    airTimeSec: 3000,
    distanceNm: 350,
    maxAltFt: 37000,
    maxGroundspeedKt: 460,
    fuelStartKg: 8000,
    fuelEndKg: 5000,
    landing: null,
    landingCount: 1,
    pointCount: 3600,
    preview: [[50, 8]],
    ...overrides,
  };
}

const landing = (touchdownRateFpm: number): LandingReport => ({
  at: 0,
  lat: 0,
  lon: 0,
  headingDeg: 0,
  groundspeedKt: 120,
  touchdownRateFpm,
  indicatedRateFpm: touchdownRateFpm,
  peakG: 1.2,
  pitchDeg: 3,
  rollDeg: 0,
  pitchRateDegSec: 0,
  flare: 'veryGood',
  noseRateDegSec: null,
  floatSec: 3,
  bounces: 0,
  bounceRatesFpm: [],
  rating: 'great',
  runway: null,
});

describe('applyFlightEdit', () => {
  it('replaces the editable fields with cleaned values and keeps the rest', () => {
    const edited = applyFlightEdit(summary(), {
      ...flightEditInput(summary()),
      departureIcao: ' lszh ',
      departureName: 'Zurich',
      arrivalIcao: '',
      aircraftIcao: 'a21n',
      livery: '  ',
      blockTimeSec: 5400,
      airTimeSec: 9999,
      distanceNm: '400.5',
      landingCount: 2.6,
    });
    expect(edited.departure).toEqual({ icao: 'LSZH', name: 'Zurich' });
    expect(edited.arrival).toBeNull();
    expect(edited.aircraft).toEqual({ icao: 'A21N', name: 'Airbus A320', livery: null });
    expect(edited.blockTimeSec).toBe(5400);
    // Air time can never exceed block time.
    expect(edited.airTimeSec).toBe(5400);
    expect(edited.distanceNm).toBe(400.5);
    expect(edited.landingCount).toBe(3);
    expect(edited.endedAt).toBe(summary().startedAt + 5400 * 1000);
    expect(edited.pointCount).toBe(3600);
    expect(edited.fuelStartKg).toBe(8000);
  });

  it('ignores garbage input', () => {
    const edited = applyFlightEdit(summary(), { blockTimeSec: -5, distanceNm: 'x' });
    expect(edited.blockTimeSec).toBe(0);
    expect(edited.distanceNm).toBe(0);
    expect(edited.startedAt).toBe(summary().startedAt);
    expect(applyFlightEdit(summary(), null).id).toBe('f1');
  });
});

describe('newManualFlight', () => {
  it('is a complete flight without a track', () => {
    const flight = newManualFlight(
      { startedAt: 1_700_000_000_000, departureIcao: 'lfpg', blockTimeSec: 600, landingCount: 1 },
      'manual-1'
    );
    expect(flight.id).toBe('manual-1');
    expect(flight.status).toBe('complete');
    expect(flight.departure).toEqual({ icao: 'LFPG', name: '' });
    expect(flight.endedAt).toBe(1_700_000_600_000);
    expect(flight.pointCount).toBe(0);
    expect(flight.preview).toEqual([]);
  });
});

describe('logbookTotals', () => {
  it('sums finished flights and rates landings', () => {
    const totals = logbookTotals([
      summary({ landing: landing(-180) }),
      summary({
        id: 'f2',
        blockTimeSec: 1800,
        airTimeSec: 1200,
        distanceNm: 100,
        landingCount: 2,
        landing: landing(-320),
      }),
      summary({ id: 'live', status: 'active', blockTimeSec: 999, landingCount: 9 }),
    ]);
    expect(totals).toEqual({
      flights: 2,
      blockTimeSec: 5400,
      airTimeSec: 4200,
      distanceNm: 450,
      landings: 3,
      averageTouchdownRateFpm: -250,
      bestTouchdownRateFpm: -180,
    });
  });

  it('has no rates without a landing report', () => {
    expect(logbookTotals([summary()]).averageTouchdownRateFpm).toBeNull();
    expect(logbookTotals([]).flights).toBe(0);
  });
});
