/**
 * Keeps the detached Flight Strip window the same shape as the strip, so the
 * strip fills it instead of floating in empty bars. The renderer reports the
 * strip's natural size; main locks the window to that aspect ratio.
 */
export interface Size {
  width: number;
  height: number;
}

/** Ratio drift that live values cause (a digit more or less) stays below this. */
const ASPECT_TOLERANCE = 0.04;

/** IPC input is untrusted: a positive size of plausible screen dimensions, or null. */
export function parseContentSize(input: unknown): Size | null {
  if (typeof input !== 'object' || input === null) return null;
  const { width, height } = input as Record<string, unknown>;
  const valid = (v: unknown): v is number =>
    typeof v === 'number' && Number.isFinite(v) && v > 0 && v < 10_000;
  return valid(width) && valid(height) ? { width, height } : null;
}

/**
 * Window size for a strip that now measures `next`. The strip keeps the scale it is
 * shown at (`displayed` inside `window`), so turning a readout off narrows the window
 * instead of blowing the strip up; the minimum size scales it up, keeping the shape.
 */
export function fitWindowToContent(window: Size, displayed: Size, next: Size, min: Size): Size {
  const scale = Math.min(window.width / displayed.width, window.height / displayed.height);
  const grow = Math.max(1, min.width / (next.width * scale), min.height / (next.height * scale));
  return {
    width: Math.round(next.width * scale * grow),
    height: Math.round(next.height * scale * grow),
  };
}

/** Whether the strip changed shape enough (a readout on or off) to refit the window. */
export function aspectChanged(previous: number | null, next: number): boolean {
  if (previous === null) return true;
  return Math.abs(next - previous) / previous > ASPECT_TOLERANCE;
}
