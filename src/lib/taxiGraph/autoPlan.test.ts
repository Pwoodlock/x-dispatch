import { describe, expect, it } from 'vitest';
import { flightPlanTaxiTarget, replansAutoRoute } from './autoPlan';

const runways = ['05', '23', '09', '27'];

describe('flightPlanTaxiTarget', () => {
  it('taxis to the departure runway at the departure airport', () => {
    const target = flightPlanTaxiTarget(
      'daag',
      { icao: 'DAAG', runway: '05' },
      { icao: 'DAAE', runway: '26' },
      runways
    );
    expect(target).toEqual({ direction: 'departure', runway: '05' });
  });

  it('taxis from the arrival runway at the arrival airport', () => {
    const target = flightPlanTaxiTarget(
      'DAAG',
      { icao: 'LFPG', runway: '09L' },
      { icao: 'DAAG', runway: '23' },
      runways
    );
    expect(target).toEqual({ direction: 'arrival', runway: '23' });
  });

  it('has nothing to plan elsewhere, without a runway, or on a runway the airport lacks', () => {
    expect(flightPlanTaxiTarget('DAAG', { icao: 'LFPG', runway: '09L' }, null, runways)).toBe(null);
    expect(flightPlanTaxiTarget('DAAG', { icao: 'DAAG' }, null, runways)).toBe(null);
    expect(flightPlanTaxiTarget('DAAG', { icao: 'DAAG', runway: '18' }, null, runways)).toBe(null);
    expect(flightPlanTaxiTarget('DAAG', null, null, runways)).toBe(null);
  });
});

describe('replansAutoRoute', () => {
  const target = { direction: 'departure' as const, runway: '05' };

  it('plans when the planner is empty, as when a plan is imported after picking the gate', () => {
    const empty = { hasRoute: false, source: 'planned' as const, direction: 'departure' as const };
    expect(replansAutoRoute({ ...empty, runway: null }, target)).toBe(true);
  });

  it('replaces an AUTO route when the plan moves to another runway', () => {
    const auto = { hasRoute: true, source: 'auto' as const, direction: 'departure' as const };
    expect(replansAutoRoute({ ...auto, runway: '23' }, target)).toBe(true);
    expect(replansAutoRoute({ ...auto, runway: '05' }, target)).toBe(false);
  });

  it('never replaces a route the pilot planned', () => {
    const planned = { hasRoute: true, source: 'planned' as const, direction: 'departure' as const };
    expect(replansAutoRoute({ ...planned, runway: '23' }, target)).toBe(false);
  });
});
