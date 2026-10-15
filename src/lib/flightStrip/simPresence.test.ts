import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createSimPresence } from './simPresence';

describe('createSimPresence', () => {
  let calls: string[];
  const make = () =>
    createSimPresence({
      graceMs: 2000,
      hide: () => calls.push('hide'),
      show: () => calls.push('show'),
    });

  beforeEach(() => {
    vi.useFakeTimers();
    calls = [];
  });
  afterEach(() => vi.useRealTimers());

  it('hides the strip once X-Plane has been gone for the grace period', () => {
    const presence = make();
    presence.update(true);
    presence.update(false);
    vi.advanceTimersByTime(1999);
    expect(calls).toEqual([]);
    vi.advanceTimersByTime(1);
    expect(calls).toEqual(['hide']);
  });

  it('keeps the strip through a short drop', () => {
    const presence = make();
    presence.update(true);
    presence.update(false);
    vi.advanceTimersByTime(1000);
    presence.update(true);
    vi.advanceTimersByTime(5000);
    expect(calls).toEqual([]);
  });

  it('shows it again when X-Plane comes back', () => {
    const presence = make();
    presence.update(true);
    presence.update(false);
    vi.advanceTimersByTime(2000);
    presence.update(true);
    expect(calls).toEqual(['hide', 'show']);
  });

  it('leaves a strip opened before X-Plane runs on screen', () => {
    const presence = make();
    presence.update(false);
    vi.advanceTimersByTime(10_000);
    expect(calls).toEqual([]);
  });

  it('forgets a pending hide once disposed', () => {
    const presence = make();
    presence.update(true);
    presence.update(false);
    presence.dispose();
    vi.advanceTimersByTime(5000);
    expect(calls).toEqual([]);
  });

  it('does not show a strip the pilot brought back by hand', () => {
    const presence = make();
    presence.update(true);
    presence.update(false);
    vi.advanceTimersByTime(2000);
    presence.shownByPilot();
    presence.update(true);
    expect(calls).toEqual(['hide']);
  });
});
