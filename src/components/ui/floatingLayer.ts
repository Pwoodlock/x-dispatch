/**
 * Whether an event started inside the Sonner toaster. Toasts render outside every dialog,
 * so a modal dialog would otherwise treat a click on a toast as a click outside and close.
 */
export function isInsideToaster(target: EventTarget | null): boolean {
  const closest = (target as Partial<Element> | null)?.closest;
  if (typeof closest !== 'function') return false;
  return closest.call(target, '[data-sonner-toaster]') !== null;
}
