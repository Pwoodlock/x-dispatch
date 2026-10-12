import { describe, expect, it } from 'vitest';
import { aspectChanged, fitWindowToContent, parseContentSize } from './windowFit';

const MIN = { width: 260, height: 40 };

describe('fitWindowToContent', () => {
  it('turns a screen-sized window around the strip into the strip shape at its current scale', () => {
    // The 1710×1073 window from the bug report around a 677×74 strip: scale 2.53 by width.
    expect(
      fitWindowToContent(
        { width: 1710, height: 1073 },
        { width: 677, height: 74 },
        { width: 677, height: 74 },
        MIN
      )
    ).toEqual({ width: 1710, height: 187 });
  });

  it('gets narrower, not taller, when readouts are turned off', () => {
    expect(
      fitWindowToContent(
        { width: 907, height: 74 },
        { width: 907, height: 74 },
        { width: 694, height: 74 },
        MIN
      )
    ).toEqual({ width: 694, height: 74 });
  });

  it('keeps a scaled-up strip at the same scale', () => {
    expect(
      fitWindowToContent(
        { width: 1814, height: 148 },
        { width: 907, height: 74 },
        { width: 694, height: 74 },
        MIN
      )
    ).toEqual({ width: 1388, height: 148 });
  });

  it('grows back to the minimum size, keeping the shape', () => {
    expect(
      fitWindowToContent(
        { width: 300, height: 40 },
        { width: 300, height: 40 },
        { width: 200, height: 40 },
        MIN
      )
    ).toEqual({ width: 260, height: 52 });
  });
});

describe('parseContentSize', () => {
  it('accepts a real size', () => {
    expect(parseContentSize({ width: 677.4, height: 74 })).toEqual({ width: 677.4, height: 74 });
  });

  it('refuses anything that is not a positive, sane size', () => {
    for (const input of [null, 'x', { width: 0, height: 10 }, { width: 10, height: NaN }]) {
      expect(parseContentSize(input)).toBeNull();
    }
    expect(parseContentSize({ width: 50_000, height: 10 })).toBeNull();
  });
});

describe('aspectChanged', () => {
  it('ignores the small width changes of live values', () => {
    expect(aspectChanged(10, 10.2)).toBe(false);
  });

  it('reacts to a readout turned on or off', () => {
    expect(aspectChanged(10, 8)).toBe(true);
    expect(aspectChanged(null, 8)).toBe(true);
  });
});
