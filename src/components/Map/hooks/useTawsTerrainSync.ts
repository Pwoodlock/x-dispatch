/**
 * TAWS terrain sync hook.
 *
 * Bridges MapLibre (via `TawsTerrainLayer.ts`) to:
 *   - The `tawsEnabled` user setting in `mapStore`
 *   - Live aircraft altitude and `on_ground` state, passed in by the caller
 *     (`Map/index.tsx` owns the single `usePlaneState` mount — hooks must
 *     NOT mount their own, as each `usePlaneState` call starts a new
 *     WebSocket state stream in the main process).
 *
 * Algorithm (ported byte-for-byte from ChartMap):
 *   - `buildColorExpression(altitudeFt)` produces a 5-band `interpolate`
 *     expression over `['elevation']` (metres, decoded by MapLibre from
 *     a Terrarium `raster-dem` source).
 *   - Throttle: at most 1 Hz (1 update per 1000 ms).
 *   - Hysteresis: only re-push to the map when altitude changes by more
 *     than 100 ft from the last pushed value.
 *   - Epsilon: 1 m between colour stops (already baked into the
 *     expression; the hook just decides *when* to call
 *     `setTawsColorStops`).
 *
 * X-Dispatch on-ground short-circuit
 * ──────────────────────────────────
 * When `onGround === true` the layer is hidden via `setTawsVisibility(false)`
 * and the cached colour expression is left untouched (no recomputation,
 * no paint-property push). When `onGround` flips back to `false` visibility
 * is restored, the last-known altitude is re-applied, and the 1 Hz / 100 ft
 * throttle resumes.
 *
 * Disconnect behaviour
 * ────────────────────
 * When the X-Plane WebSocket is disconnected the layer is also hidden:
 * with no live altitude the expression would fall back to 0 ft MSL and
 * paint all terrain above sea level red — the same "all-red" failure the
 * on-ground short-circuit exists to prevent.
 */
import { useEffect, useRef } from 'react';
import { useMapStore } from '@/stores/mapStore';
import type { PlaneState } from '@/types/xplane';
import {
  TAWS_LAYER_ID,
  TAWS_SOURCE_ID,
  addTawsTerrainLayer,
  buildColorExpression,
  removeTawsTerrainLayer,
  setTawsColorStops,
  setTawsVisibility,
} from '../layers/dynamic/TawsTerrainLayer';
import type { MapRef } from './useMapSetup';

// Throttle: 1 Hz max update rate
const THROTTLE_MS = 1000;
// Hysteresis: ignore altitude changes smaller than this
const ALT_HYSTERESIS_FT = 100;
// Re-attempt delay for pushing the latest colour expression to the map
// (covers the brief window where the layer was just added).
const RETRY_PAINT_MS = 50;

export interface UseTawsTerrainSyncOptions {
  mapRef: MapRef;
  /** Live plane state from the caller's `usePlaneState` mount (null when no state yet). */
  planeState: PlaneState | null;
  /** X-Plane WebSocket connection flag from the same `usePlaneState` mount. */
  isXPlaneConnected: boolean;
}

/**
 * The user setting is read from `mapStore` directly; the X-Plane state is
 * passed in by the caller so only one `usePlaneState` mount (and therefore
 * one WebSocket stream) exists per map.
 */
export function useTawsTerrainSync({
  mapRef,
  planeState,
  isXPlaneConnected,
}: UseTawsTerrainSyncOptions): void {
  const tawsEnabled = useMapStore((s) => s.tawsEnabled);

  // Module-local-ish state: the throttling counters and last-pushed
  // expression live in refs so re-renders don't reset them.
  const lastAltitudeFtRef = useRef(0);
  const lastUpdateMsRef = useRef(0);
  const lastExpressionRef = useRef<unknown[]>(buildColorExpression(0));
  // Cached altitude + on-ground so we can apply them once the layer is
  // back on the map (e.g. after a style rebuild).
  const lastKnownAltitudeRef = useRef(0);
  const lastOnGroundRef = useRef<boolean | null>(null);
  // Pending retry timer (id so we can clear on unmount).
  const retryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Compute the user-facing effective visibility: opt-in AND connected AND
  // not on ground. Disconnected is treated like on-ground: with no live
  // altitude the expression would fall back to 0 ft MSL and paint the whole
  // map red, so we hide instead.
  const onGround = planeState?.onGround === true;
  const effectiveVisible = tawsEnabled && isXPlaneConnected && !onGround;
  // Mirrored into a ref so the style.load re-add path (effect 1) can read
  // the current visibility without taking onGround/connection as deps —
  // otherwise every ground/connection flip would tear down and re-add the
  // source, forcing tile re-fetches.
  const effectiveVisibleRef = useRef(effectiveVisible);
  useEffect(() => {
    effectiveVisibleRef.current = effectiveVisible;
  }, [effectiveVisible]);

  // Compute altitude in feet (unused while disconnected — the layer is
  // hidden and effect 3 bails before recomputing).
  const altitudeFt = isXPlaneConnected && planeState ? planeState.altitudeMSL : 0;

  // Cache for later use (style.load re-add path). The lint rule forbids
  // ref.current writes during render, so we move it into an effect that
  // mirrors the same dependency on altitudeFt.
  useEffect(() => {
    lastKnownAltitudeRef.current = altitudeFt;
  }, [altitudeFt]);

  //  1. Mount / unmount / toggle: add or remove the layer
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    // We always add the layer once the user has opted in (so the source
    // is decoded and ready before X-Plane connects). Visibility is
    // controlled separately below — the layer being present doesn't mean
    // it's visible.
    const wantLayer = tawsEnabled;

    const addLayer = () => {
      const m = mapRef.current;
      if (!m) return;
      if (m.getSource(TAWS_SOURCE_ID)) {
        // Style rebuild carried it over (e.g. via transformStyle) —
        // just re-apply visibility + last expression.
        setTawsVisibility(m, effectiveVisibleRef.current);
        setTawsColorStops(m, lastExpressionRef.current);
        return;
      }
      addTawsTerrainLayer(m, lastExpressionRef.current, effectiveVisibleRef.current);
    };

    if (!wantLayer) {
      removeTawsTerrainLayer(map);
      if (retryTimerRef.current) {
        clearTimeout(retryTimerRef.current);
        retryTimerRef.current = null;
      }
      return undefined;
    }

    if (map.isStyleLoaded()) {
      addLayer();
    } else {
      map.once('style.load', addLayer);
    }

    // Re-add after every style.load (theme switch rebuilds the style and
    // the source/layer are stripped with it). The `once` above is for
    // the initial mount; this listener covers the rebuild case.
    const onStyleLoad = () => addLayer();
    map.on('style.load', onStyleLoad);

    return () => {
      map.off('style.load', onStyleLoad);
      removeTawsTerrainLayer(map);
      if (retryTimerRef.current) {
        clearTimeout(retryTimerRef.current);
        retryTimerRef.current = null;
      }
    };
    // NOTE: onGround / connection state deliberately excluded — those only
    // affect visibility (effect 2) and colour stops (effect 3), not layer
    // existence. Including them would tear down and re-add the raster-dem
    // source on every takeoff/landing, forcing tile re-fetches.
  }, [mapRef, tawsEnabled]);

  //  2. Visibility: opt-in toggle + on-ground short-circuit
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    setTawsVisibility(map, effectiveVisible);
  }, [mapRef, effectiveVisible]);

  // 3. Colour stops: 1 Hz throttle + 100 ft hysteresis
  // Skip entirely while disconnected or on the ground — ChartMap would
  // still recompute (and indeed show all red at altitude=0); we suppress
  // that update so we never push an "everything is danger" expression.
  useEffect(() => {
    if (!tawsEnabled) return;
    if (!isXPlaneConnected) {
      // Hidden by effect 2; leave the cached expression untouched so the
      // layer comes back with the pre-disconnect colours on reconnect.
      return;
    }
    if (onGround) {
      // Remember the ground state so when we lift off we know to resume
      // recomputation.
      lastOnGroundRef.current = true;
      return;
    }

    // Just lifted off — flush the latest known altitude through the
    // throttle logic so the layer reflects current position immediately
    // (subject to the 1 Hz guard).
    if (lastOnGroundRef.current === true) {
      lastOnGroundRef.current = false;
      lastUpdateMsRef.current = 0; // force-push on next tick
    }

    const now = Date.now();
    const altDelta = Math.abs(altitudeFt - lastAltitudeFtRef.current);
    const sinceUpdate = now - lastUpdateMsRef.current;
    // The hysteresis guard combines BOTH conditions: skip if the
    // altitude hasn't changed much AND we're inside the throttle window.
    // Either condition on its own is enough to push (i.e. on a 200 ft
    // climb within the 1 s window we still push exactly once per 1 s).
    if (altDelta < ALT_HYSTERESIS_FT && sinceUpdate < THROTTLE_MS) {
      return;
    }

    const expression = buildColorExpression(altitudeFt);
    lastAltitudeFtRef.current = altitudeFt;
    lastUpdateMsRef.current = now;
    lastExpressionRef.current = expression;

    const apply = () => {
      const map = mapRef.current;
      if (!map) return;
      if (!map.getLayer(TAWS_LAYER_ID)) {
        // Layer was just removed (toggle off, style change, etc.) — try
        // again shortly. Bounded retry to avoid leaking the timer on a
        // long-unmount.
        retryTimerRef.current = setTimeout(apply, RETRY_PAINT_MS);
        return;
      }
      setTawsColorStops(map, expression);
    };
    apply();
  }, [mapRef, tawsEnabled, isXPlaneConnected, onGround, altitudeFt]);
}
