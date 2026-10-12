/**
 * The settings main applies to the detached flight strip window. The renderer
 * owns them in the settings store and pushes every change; main keeps the last
 * set and uses the defaults until the first push.
 */
export interface FlightStripWindowOptions {
  /** Clicks pass through to the simulator; only the lock grip still takes them. */
  locked: boolean;
  /** 0.3 to 1. Electron cannot change window opacity on Linux. */
  opacity: number;
  /** Stays above a fullscreen simulator. */
  alwaysOnTop: boolean;
}

export const DEFAULT_FLIGHT_STRIP_WINDOW_OPTIONS: FlightStripWindowOptions = {
  locked: false,
  opacity: 1,
  alwaysOnTop: true,
};

export const FLIGHT_STRIP_OPACITY_RANGE = { min: 0.3, max: 1 } as const;

export function clampFlightStripOpacity(opacity: number): number {
  const safe = Number.isFinite(opacity) ? opacity : 1;
  const clamped = Math.max(
    FLIGHT_STRIP_OPACITY_RANGE.min,
    Math.min(FLIGHT_STRIP_OPACITY_RANGE.max, safe)
  );
  return Math.round(clamped * 100) / 100;
}

/** IPC input is untrusted: keep valid values, fall back to the defaults. */
export function parseFlightStripWindowOptions(input: unknown): FlightStripWindowOptions {
  const source =
    typeof input === 'object' && input !== null ? (input as Record<string, unknown>) : {};
  const out = { ...DEFAULT_FLIGHT_STRIP_WINDOW_OPTIONS };
  if (typeof source.locked === 'boolean') out.locked = source.locked;
  if (typeof source.alwaysOnTop === 'boolean') out.alwaysOnTop = source.alwaysOnTop;
  if (typeof source.opacity === 'number' && Number.isFinite(source.opacity)) {
    out.opacity = clampFlightStripOpacity(source.opacity);
  }
  return out;
}

/** Locked passes clicks through, except while the pointer is on the grip (`capture`). */
export function ignoresMouse(options: FlightStripWindowOptions, capture: boolean): boolean {
  return options.locked && !capture;
}

/** The part of BrowserWindow the options touch, so tests can stand in for it. */
export interface FlightStripWindowLike {
  isDestroyed(): boolean;
  setOpacity(opacity: number): void;
  setAlwaysOnTop(flag: boolean, level?: 'screen-saver'): void;
  moveTop(): void;
  setIgnoreMouseEvents(ignore: boolean, options?: { forward?: boolean }): void;
}

/**
 * Applies the options to an open strip window. While ignoring the mouse, moves are
 * still forwarded (Windows and macOS) so hovering the strip can reveal the grip.
 */
export function applyFlightStripWindowOptions(
  win: FlightStripWindowLike,
  options: FlightStripWindowOptions,
  { capture, platform }: { capture: boolean; platform: NodeJS.Platform }
): void {
  if (win.isDestroyed()) return;
  if (platform !== 'linux') win.setOpacity(options.opacity);
  if (options.alwaysOnTop) {
    // The default level sits below a fullscreen simulator.
    win.setAlwaysOnTop(true, 'screen-saver');
    win.moveTop();
  } else {
    win.setAlwaysOnTop(false);
  }
  const ignore = ignoresMouse(options, capture);
  // Linux cannot forward mouse moves, so there the grip stays hidden while locked.
  if (ignore && platform !== 'linux') win.setIgnoreMouseEvents(true, { forward: true });
  else win.setIgnoreMouseEvents(ignore);
}
