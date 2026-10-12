/**
 * Strings main shows natively (menu, crash dialog). Main has no i18n, so the
 * renderer pushes them translated; the English set covers the window before the
 * first push and any key a translation is missing.
 */
export interface NativeLabels {
  menu: {
    settings: string;
    edit: string;
    window: string;
    help: string;
    website: string;
    discord: string;
    checkForUpdates: string;
    recentAirports: string;
    file: string;
    openFlightPlan: string;
    importSimbrief: string;
    launchXPlane: string;
    findAirport: string;
    view: string;
    zoomIn: string;
    zoomOut: string;
    zoomReset: string;
    toggleSidebar: string;
    flightStripWindow: string;
    flightStripLock: string;
    toggleFullScreen: string;
    close: string;
    keyboardShortcuts: string;
    openLogs: string;
  };
  crash: {
    title: string;
    message: string;
    reload: string;
    quit: string;
  };
  /** The hung-window dialog; its Reload and Quit buttons reuse the crash labels. */
  unresponsive: {
    title: string;
    message: string;
    wait: string;
  };
}

export const DEFAULT_NATIVE_LABELS: NativeLabels = {
  menu: {
    settings: 'Settings…',
    edit: 'Edit',
    window: 'Window',
    help: 'Help',
    website: 'X-Dispatch Website',
    discord: 'Discord Community',
    checkForUpdates: 'Check for Updates…',
    recentAirports: 'Recent Airports',
    file: 'File',
    openFlightPlan: 'Open Flight Plan…',
    importSimbrief: 'Import from SimBrief…',
    launchXPlane: 'Launch X-Plane…',
    findAirport: 'Find Airport',
    view: 'View',
    zoomIn: 'Zoom In',
    zoomOut: 'Zoom Out',
    zoomReset: 'Actual Size',
    toggleSidebar: 'Toggle Sidebar',
    flightStripWindow: 'Flight Strip Window',
    flightStripLock: 'Lock Flight Strip',
    toggleFullScreen: 'Toggle Full Screen',
    close: 'Close Window',
    keyboardShortcuts: 'Keyboard Shortcuts',
    openLogs: 'Open Logs Folder',
  },
  crash: {
    title: 'X-Dispatch stopped working',
    message: 'The window crashed again shortly after reloading. Reload it once more, or quit?',
    reload: 'Reload',
    quit: 'Quit',
  },
  unresponsive: {
    title: 'X-Dispatch is not responding',
    message: 'The window has stopped responding. You can reload it, keep waiting, or quit.',
    wait: 'Keep Waiting',
  },
};

function pickStrings<T extends Record<string, string>>(defaults: T, input: unknown): T {
  const source =
    typeof input === 'object' && input !== null ? (input as Record<string, unknown>) : {};
  const out = { ...defaults };
  for (const key of Object.keys(defaults) as (keyof T)[]) {
    const value = source[key as string];
    if (typeof value === 'string' && value.length > 0) out[key] = value as T[keyof T];
  }
  return out;
}

/** IPC input is untrusted: keep known string fields, fall back to English for the rest. */
export function parseNativeLabels(input: unknown): NativeLabels {
  const source =
    typeof input === 'object' && input !== null ? (input as Record<string, unknown>) : {};
  return {
    menu: pickStrings(DEFAULT_NATIVE_LABELS.menu, source.menu),
    crash: pickStrings(DEFAULT_NATIVE_LABELS.crash, source.crash),
    unresponsive: pickStrings(DEFAULT_NATIVE_LABELS.unresponsive, source.unresponsive),
  };
}
