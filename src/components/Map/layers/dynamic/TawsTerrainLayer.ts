/**
 * TAWS (Terrain Awareness and Warning System) terrain layer.
 *
 * Ported byte-for-byte from ChartMap (frontend/src/composables/useTawsTerrain.ts
 * + frontend/src/components/layers/TawsTerrainLayer.vue) — algorithm and
 * color-band definitions are unchanged.
 *
 * Algorithm
 * ─────────
 * 5 altitude-relative color bands over a MapLibre `color-relief` layer,
 * driven by a `raster-dem` source (Terrarium encoding). The expression
 * is an `interpolate` over `['elevation']` (in metres — MapLibre decodes
 * Terrarium RGB into metres natively) with these bands, all relative to
 * the aircraft's current altitude in feet:
 *
 *   1. Transparent   — terrain more than 2000 ft below aircraft
 *   2. Dark green    — 1000–2000 ft below (safe but visible)
 *   3. Yellow-green  —  500–1000 ft below (caution)
 *   4. Yellow        —    0–500 ft below (warning)
 *   5. Red           —  at or above aircraft altitude (danger)
 *
 * Hard colour boundaries are produced with a 1 m epsilon on each side of
 * every stop. The expression is recomputed by the sync hook at most once
 * per second and only when altitude changes by more than 100 ft (hysteresis).
 *
 * X-Dispatch on-ground short-circuit
 * ──────────────────────────────────
 * ChartMap colours all terrain as red when the user is parked (because
 * aircraft altitude is 0 ft MSL → all terrain is at or above the plane).
 * In X-Dispatch we hide the layer entirely (visibility: 'none') and freeze
 * the last-known colour expression while the X-Plane dataref
 * `sim/flightmodel/forces/on_ground` reports `1`. When the plane lifts off,
 * visibility is restored and the expression recomputation resumes.
 */
import maplibregl from 'maplibre-gl';

// ── Constants (mirror ChartMap verbatim) ──────────────────────────────────

/** Public AWS Terrarium terrain tile bucket. Direct fetch — no proxy. */
export const TAWS_TERRAIN_URL =
  'https://elevation-tiles-prod.s3.amazonaws.com/terrarium/{z}/{x}/{y}.png';

export const TAWS_SOURCE_ID = 'taws-terrain';
export const TAWS_LAYER_ID = 'taws-terrain-layer';

const FT_TO_M = 0.3048;
const TERRAIN_EPS_M = 1; // 1 m epsilon for hard colour boundaries
const OCEAN_FLOOR_M = -11000; // Mirrors ChartMap's -11000 ocean floor clamp
const MAX_ELEVATION_M = 9000; // Mirror ChartMap's 9000 m ceiling

/**
 * Build the MapLibre color-relief expression array for the given aircraft
 * altitude in feet MSL.
 *
 * Returns an `interpolate` expression over `['elevation']` (in metres, decoded
 * by MapLibre from the raster-dem Terrarium source) with 5 bands.
 * Hard colour boundaries are produced with a 1 m epsilon between stops.
 */
export function buildColorExpression(altitudeFt: number): unknown[] {
  const altM = altitudeFt * FT_TO_M;

  // Elevation thresholds in metres relative to aircraft altitude
  const danger = altM; // at or above aircraft  → red
  const warning = altM - 500 * FT_TO_M; // 0–500ft below         → yellow
  const caution = altM - 1000 * FT_TO_M; // 500–1000ft below      → yellow-green
  const safeVis = altM - 2000 * FT_TO_M; // 1000–2000ft below     → dark green
  // below safeVis → transparent

  // Epsilon (metres) to create hard colour boundaries in the interpolation
  const EPS = TERRAIN_EPS_M;

  return [
    'interpolate',
    ['linear'],
    ['elevation'],
    -11000,
    'rgba(0,0,0,0)', // ocean floor — transparent
    Math.max(-11000, safeVis - EPS),
    'rgba(0,0,0,0)', // still transparent
    safeVis,
    '#1a6b1a', // dark green starts
    Math.max(safeVis, caution - EPS),
    '#1a6b1a',
    caution,
    '#7aab2d', // yellow-green starts
    Math.max(caution, warning - EPS),
    '#7aab2d',
    warning,
    '#d4c432', // yellow starts
    Math.max(warning, danger - EPS),
    '#d4c432',
    danger,
    '#cc2222', // red starts
    9000,
    '#cc2222', // max elevation — red
  ];
}

// Re-export bounds for the sync hook (so it can use the same constants
// when checking expression identity).
export const TAWS_ALGORITHM_CONSTANTS = {
  FT_TO_M,
  TERRAIN_EPS_M,
  OCEAN_FLOOR_M,
  MAX_ELEVATION_M,
} as const;

// ── Layer placement ──────────────────────────────────────────────────────

/**
 * Find a reasonable MapLibre layer id to insert TAWS *below*.
 *
 * ChartMap targets `weather-radar-layer` first so TAWS sits underneath it,
 * then falls through to navdata symbol layers. In X-Dispatch the layer
 * catalog is different, so we probe for the same class of layers (radar
 * overlay, then airways, then navaid symbol layers) and finally fall
 * through to the first symbol layer (mirroring the placement of
 * `terrain-hillshade` in `globeUtils.ts`).
 */
export function findTawsBeforeId(map: maplibregl.Map): string | undefined {
  for (const id of [
    'weather-radar-layer',
    'rainviewer-layer-0',
    'airways-high',
    'airways-low',
    'navaid-vor',
    'navaid-ndb',
    'navdata-fixes',
    'airport-labels',
    'airports',
  ]) {
    if (map.getLayer(id)) return id;
  }
  // Fall back to the first symbol layer (matches `getFirstSymbolLayerId`
  // placement used by terrain hillshade in `globeUtils.ts`).
  const layers = map.getStyle()?.layers;
  if (layers) {
    for (const layer of layers) {
      if (layer.type === 'symbol') return layer.id;
    }
  }
  return undefined;
}

// ── Source / layer lifecycle ─────────────────────────────────────────────

/**
 * Add the TAWS terrain source + color-relief layer to the map. Idempotent:
 * safe to call after a style rebuild (`style.load`).
 *
 * `colorStops` is the output of `buildColorExpression(altitudeFt)` for the
 * last-known aircraft altitude. `visible` is the user's opt-in toggle
 * (we also force-hide while on the ground via setTawsVisibility).
 */
export function addTawsTerrainLayer(
  map: maplibregl.Map,
  colorStops: unknown[],
  visible: boolean
): void {
  if (map.getSource(TAWS_SOURCE_ID)) return;

  // Use a raster-dem source so MapLibre decodes Terrarium RGB → metres
  // natively. `color-relief` requires a raster-dem source; it is not
  // supported on plain raster sources in MapLibre 4+.
  map.addSource(TAWS_SOURCE_ID, {
    type: 'raster-dem',
    tiles: [TAWS_TERRAIN_URL],
    tileSize: 256,
    maxzoom: 12,
    encoding: 'terrarium',
    attribution: '&copy; <a href="https://github.com/tilezen/joerd">Tilezen Joerd</a>',
  });

  map.addLayer(
    {
      id: TAWS_LAYER_ID,
      type: 'color-relief',
      source: TAWS_SOURCE_ID,
      paint: {
        'color-relief-color': colorStops as maplibregl.ExpressionSpecification,
        'color-relief-opacity': 0.6,
      },
      layout: {
        visibility: visible ? 'visible' : 'none',
      },
    } as unknown as maplibregl.LayerSpecification,
    findTawsBeforeId(map)
  );
}

/**
 * Remove the TAWS terrain layer and source. Tolerates a mid-destroy map
 * (the ChartMap original guards with try/catch; we mirror that).
 */
export function removeTawsTerrainLayer(map: maplibregl.Map): void {
  try {
    if (map.getLayer(TAWS_LAYER_ID)) map.removeLayer(TAWS_LAYER_ID);
    if (map.getSource(TAWS_SOURCE_ID)) map.removeSource(TAWS_SOURCE_ID);
  } catch {
    // Map may already be destroyed
  }
}

/**
 * Set the TAWS layer visibility (toggling the user setting or the
 * on-ground short-circuit both call this).
 */
export function setTawsVisibility(map: maplibregl.Map, visible: boolean): void {
  try {
    if (map.getLayer(TAWS_LAYER_ID)) {
      map.setLayoutProperty(TAWS_LAYER_ID, 'visibility', visible ? 'visible' : 'none');
    }
  } catch {
    // Layer not yet loaded / map mid-destroy
  }
}

/**
 * Push a new color-relief color expression to the map. No-op if the layer
 * isn't there yet (the hook will retry on the next paint tick).
 */
export function setTawsColorStops(map: maplibregl.Map, colorStops: unknown[]): void {
  try {
    if (map.getLayer(TAWS_LAYER_ID)) {
      map.setPaintProperty(
        TAWS_LAYER_ID,
        'color-relief-color',
        colorStops as maplibregl.ExpressionSpecification
      );
    }
  } catch {
    // Layer not yet loaded
  }
}
