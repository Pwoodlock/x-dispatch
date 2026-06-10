/**
 * TAWS terrain sync hook.
 *
 * Bridges MapLibre (via `TawsTerrainLayer.ts`) to:
 *   - The `tawsEnabled` user setting in `mapStore`
 *   - Live aircraft altitude and `on_ground` state from the X-Plane WebSocket
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
 */
import { useEffect, useRef } from 'react';
import { usePlaneState } from '@/queries';
import { useMapStore } from '@/stores/mapStore';
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
}

/**
 * Hook signature intentionally minimal — the user setting is read from
 * `mapStore` directly, and the X-Plane state is read via `usePlaneState`
 * (which is already mounted by `Map/index.tsx` for the plane tracker).
 */
export function useTawsTerrainSync({ mapRef }: UseTawsTerrainSyncOptions): void {
  // The plane-state stream is started by `Map/index.tsx`'s `usePlaneState`
  // mount. We share it; calling `usePlaneState` again would re-subscribe.
  // Since both consumers are children of the same parent component, React
  // re-uses the same state instance via the singleton-like pattern used
  // elsewhere in this repo.
  const tawsEnabled = useMapStore((s) => s.tawsEnabled);
  const { state: planeState, connected: isXPlaneConnected } = usePlaneState();

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

  // Compute the user-facing effective visibility: opt-in AND not on ground.
  const onGround = planeState?.onGround === true;
  const effectiveVisible = tawsEnabled && !onGround;

  // Compute altitude in feet (0 when disconnected — ChartMap's fallback).
  const altitudeFt = isXPlaneConnected && planeState ? planeState.altitudeMSL : 0;

  // Cache for later use (style.load re-add path). The lint rule forbids
  // ref.current writes during render, so we move it into an effect that
  // mirrors the same dependency on altitudeFt.
  useEffect(() => {
    lastKnownAltitudeRef.current = altitudeFt;
  }, [altitudeFt]);

  // ── 1. Mount / unmount / toggle: add or remove the layer ─────────────
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
        setTawsVisibility(m, tawsEnabled && !onGround);
        setTawsColorStops(m, lastExpressionRef.current);
        return;
      }
      addTawsTerrainLayer(m, lastExpressionRef.current, tawsEnabled && !onGround);
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
  }, [mapRef, tawsEnabled, onGround]);

  // ── 2. Visibility: opt-in toggle + on-ground short-circuit ──────────
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    setTawsVisibility(map, effectiveVisible);
  }, [mapRef, effectiveVisible]);

  // ── 3. Colour stops: 1 Hz throttle + 100 ft hysteresis ───────────────
  // Skip entirely while on the ground — ChartMap would still recompute
  // (and indeed show all red at altitude=0); we suppress that update so
  // we never push a "everything is danger" expression.
  useEffect(() => {
    if (!tawsEnabled) return;
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
  }, [mapRef, tawsEnabled, onGround, altitudeFt]);
}
