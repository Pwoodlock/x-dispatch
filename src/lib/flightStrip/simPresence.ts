/**
 * Hides the detached strip once X-Plane has been gone for a while (the sim quit) and
 * brings it back when X-Plane reconnects. A strip opened before X-Plane runs stays
 * up, and so does one the pilot showed again by hand while the sim was away.
 */
export interface SimPresence {
  /** Feed every X-Plane connection change. */
  update(connected: boolean): void;
  /** The pilot showed the hidden strip again; reconnecting no longer needs to. */
  shownByPilot(): void;
  dispose(): void;
}

export function createSimPresence({
  graceMs,
  hide,
  show,
}: {
  graceMs: number;
  hide: () => void;
  show: () => void;
}): SimPresence {
  let connected = false;
  let hidden = false;
  let pending: ReturnType<typeof setTimeout> | null = null;

  const cancel = () => {
    if (pending) clearTimeout(pending);
    pending = null;
  };

  return {
    update(next) {
      if (next === connected) return;
      connected = next;
      cancel();
      if (connected) {
        if (hidden) show();
        hidden = false;
        return;
      }
      pending = setTimeout(() => {
        pending = null;
        hidden = true;
        hide();
      }, graceMs);
    },
    shownByPilot() {
      cancel();
      hidden = false;
    },
    dispose: cancel,
  };
}
