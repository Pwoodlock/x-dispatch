import { describe, expect, it } from 'vitest';
import { FLOATING_LAYER_SELECTOR, isInsideFloatingLayer } from './floatingLayer';

/** Stands in for a DOM element whose ancestors match the given selector. */
function element(insideFloatingLayer: boolean): EventTarget {
  return {
    closest: (selector: string) =>
      insideFloatingLayer && selector === FLOATING_LAYER_SELECTOR ? {} : null,
  } as unknown as EventTarget;
}

describe('isInsideFloatingLayer', () => {
  it('is true for a click inside a toast or a floating panel', () => {
    expect(isInsideFloatingLayer(element(true))).toBe(true);
  });

  it('is false for anything outside them', () => {
    expect(isInsideFloatingLayer(element(false))).toBe(false);
  });

  it('is false for a target that is not an element', () => {
    expect(isInsideFloatingLayer(null)).toBe(false);
    expect(isInsideFloatingLayer({} as EventTarget)).toBe(false);
  });

  it('matches the Sonner toaster and anything marked as a floating layer', () => {
    expect(FLOATING_LAYER_SELECTOR).toContain('[data-sonner-toaster]');
    expect(FLOATING_LAYER_SELECTOR).toContain('[data-floating-layer]');
  });
});
