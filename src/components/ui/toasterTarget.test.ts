import { describe, expect, it } from 'vitest';
import { isInsideToaster } from './toasterTarget';

/** Stands in for a DOM element whose ancestors match the given selectors. */
function element(ancestorSelectors: string[]): EventTarget {
  return {
    closest: (selector: string) => (ancestorSelectors.includes(selector) ? {} : null),
  } as unknown as EventTarget;
}

describe('isInsideToaster', () => {
  it('is true for a button inside a toast', () => {
    expect(isInsideToaster(element(['[data-sonner-toaster]']))).toBe(true);
  });

  it('is false for anything outside the toaster', () => {
    expect(isInsideToaster(element([]))).toBe(false);
  });

  it('is false for a target that is not an element', () => {
    expect(isInsideToaster(null)).toBe(false);
    expect(isInsideToaster({} as EventTarget)).toBe(false);
  });
});
