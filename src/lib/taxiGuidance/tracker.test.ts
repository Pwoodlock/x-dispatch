import { describe, expect, it } from 'vitest';
import { at, leg, makeRoute } from './__fixtures__/routes';
import { createGuidanceTracker } from './tracker';

const departure = makeRoute(
  [
    [0, 0],
    [0, 200],
    [200, 200],
  ],
  [leg('A'), leg('B')],
  { runway: '27' }
);
const elsewhere = makeRoute(
  [
    [5000, 0],
    [5000, 300],
  ],
  [leg('K')],
  { direction: 'arrival' }
);

describe('createGuidanceTracker', () => {
  it('follows the route the aircraft is on and trims what is behind it', () => {
    const tracker = createGuidanceTracker();
    const tracked = tracker.update([elsewhere, departure], at(1, 50))!;
    expect(tracked.route).toBe(departure);
    expect(tracked.view.next?.event).toMatchObject({ kind: 'turn', turn: 'turnRight', name: 'B' });
    expect(tracked.view.next?.distance).toBeCloseTo(150, 0);
    expect(tracked.remaining).toHaveLength(3);
    expect(tracked.remaining[0]!.lat).toBeCloseTo(at(0, 50).lat, 7);
  });

  it('is not off route at a gate beside the first leg, until it has joined and left', () => {
    const taxilane = makeRoute(
      [
        [-30, 60],
        [100, 60],
        [100, 400],
      ],
      [leg('P65'), leg('M11')]
    );
    const tracker = createGuidanceTracker();
    expect(tracker.update([taxilane], at(0, 0))!.view.offRoute).toBe(false);
    expect(tracker.update([taxilane], at(50, 58))!.view.offRoute).toBe(false);
    expect(tracker.update([taxilane], at(100, 200))!.view.offRoute).toBe(false);
    expect(tracker.update([taxilane], at(40, 200))!.view.offRoute).toBe(true);
  });

  it('points at the route from the gate, then along it ahead of the aircraft', () => {
    const tracker = createGuidanceTracker();
    expect(tracker.update([departure], at(-60, 50))!.bearing).toBeCloseTo(90, 0);
    expect(tracker.update([departure], at(0, 100))!.bearing).toBeCloseTo(0, 0);
    expect(tracker.update([departure], at(0, 190))!.bearing).toBeGreaterThan(45);
  });

  it('tracks nothing when the aircraft is at another airport', () => {
    expect(createGuidanceTracker().update([departure], at(0, 20_000))).toBeNull();
  });
});
