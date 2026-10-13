/**
 * Floating layers drawn above every dialog: the Sonner toaster and anything marked
 * `data-floating-layer` (the debug panels). An open modal blocks clicks outside itself,
 * so these take pointer events back (`pointer-events-auto`), and dialogs must not treat
 * a click on them as a click outside and close.
 */
export const FLOATING_LAYER_SELECTOR = '[data-sonner-toaster], [data-floating-layer]';

/** Whether an event started inside a floating layer. */
export function isInsideFloatingLayer(target: EventTarget | null): boolean {
  const closest = (target as Partial<Element> | null)?.closest;
  if (typeof closest !== 'function') return false;
  return closest.call(target, FLOATING_LAYER_SELECTOR) !== null;
}
