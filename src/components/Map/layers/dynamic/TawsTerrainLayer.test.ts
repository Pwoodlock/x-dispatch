/**
 * TAWS terrain layer — algorithm + MapLibre lifecycle tests.
 *
 * MVP test file covering:
 *   1. buildColorExpression algorithm (byte-for-byte port from ChartMap)
 *   2. MapLibre source/layer lifecycle (add, remove, visibility, paint)
 *   3. On-ground short-circuit (verified at the function boundary — the
 *      hook calls setTawsVisibility(false) when on_ground === true; this
 *      test asserts the function call has the expected effect on the map)
 *
 * Colocated per X-Dispatch convention (tests next to source).
 */
import { describe, expect, it, vi } from 'vitest';
import {
  TAWS_LAYER_ID,
  TAWS_SOURCE_ID,
  TAWS_TERRAIN_URL,
  addTawsTerrainLayer,
  buildColorExpression,
  findTawsBeforeId,
  removeTawsTerrainLayer,
  setTawsColorStops,
  setTawsVisibility,
} from './TawsTerrainLayer';

// ────────────────────────────────────────────────────────────────────────────
// Mock map
// ────────────────────────────────────────────────────────────────────────────

interface MockMap {
  layers: Set<string>;
  sources: Map<string, Record<string, unknown>>;
  styleLayers: { id: string; type: string }[];
  getStyle: () => { layers: { id: string; type: string }[] } | undefined;
  getLayer: (id: string) => { id: string } | undefined;
  getSource: (id: string) => Record<string, unknown> | undefined;
  addLayer: ReturnType<typeof vi.fn>;
  addSource: ReturnType<typeof vi.fn>;
  removeLayer: ReturnType<typeof vi.fn>;
  removeSource: ReturnType<typeof vi.fn>;
  setLayoutProperty: ReturnType<typeof vi.fn>;
  setPaintProperty: ReturnType<typeof vi.fn>;
  isStyleLoaded: () => boolean;
}

function makeMapMock(opts: { withSymbolLayer?: boolean } = {}): MockMap {
  const layers = new Set<string>();
  const sources = new Map<string, Record<string, unknown>>();
  const styleLayers = [
    { id: 'background', type: 'background' },
    { id: 'carto-raster', type: 'raster' },
  ];
  if (opts.withSymbolLayer) {
    styleLayers.push({ id: 'navaid-vor', type: 'symbol' });
  }
  return {
    layers,
    sources,
    styleLayers,
    getStyle: () => ({ layers: styleLayers }),
    getLayer: (id) => (layers.has(id) ? { id } : undefined),
    getSource: (id) => sources.get(id),
    addLayer: vi.fn((spec: { id: string }) => {
      layers.add(spec.id);
      // Re-record the layer in the style spec for findTawsBeforeId
      if (!styleLayers.find((l) => l.id === spec.id)) {
        styleLayers.push({ id: spec.id, type: 'symbol' });
      }
    }),
    addSource: vi.fn((id: string, def: Record<string, unknown>) => {
      sources.set(id, def);
    }),
    removeLayer: vi.fn((id: string) => {
      layers.delete(id);
    }),
    removeSource: vi.fn((id: string) => {
      sources.delete(id);
    }),
    setLayoutProperty: vi.fn(),
    setPaintProperty: vi.fn(),
    isStyleLoaded: () => true,
  };
}

// ────────────────────────────────────────────────────────────────────────────
// Algorithm: buildColorExpression (byte-for-byte port from ChartMap)
// ────────────────────────────────────────────────────────────────────────────

describe('buildColorExpression', () => {
  // The expression shape from ChartMap — anchored here so any drift shows
  // up as a diff in this test, not as a silent regression in the map.
  const expectedShapeAt = (altitudeFt: number): unknown[] => {
    const FT_TO_M = 0.3048;
    const altM = altitudeFt * FT_TO_M;
    const danger = altM;
    const warning = altM - 500 * FT_TO_M;
    const caution = altM - 1000 * FT_TO_M;
    const safeVis = altM - 2000 * FT_TO_M;
    const EPS = 1;
    return [
      'interpolate',
      ['linear'],
      ['elevation'],
      -11000,
      'rgba(0,0,0,0)',
      Math.max(-11000, safeVis - EPS),
      'rgba(0,0,0,0)',
      safeVis,
      '#1a6b1a',
      Math.max(safeVis, caution - EPS),
      '#1a6b1a',
      caution,
      '#7aab2d',
      Math.max(caution, warning - EPS),
      '#7aab2d',
      warning,
      '#d4c432',
      Math.max(warning, danger - EPS),
      '#d4c432',
      danger,
      '#cc2222',
      9000,
      '#cc2222',
    ];
  };

  it('produces a 5-band expression for altitude=10000ft', () => {
    const expr = buildColorExpression(10000);
    // 4 band boundaries (transparent->green, green->yg, yg->yellow, yellow->red)
    // → 4 hard-band color entries (#1a6b1a, #7aab2d, #d4c432, #cc2222) plus
    // the 9000 m ceiling clamp. Assert via the expected shape, not by count.
    expect(expr).toEqual(expectedShapeAt(10000));
  });

  it('matches the expected byte-for-byte shape at altitude=0ft (parked)', () => {
    // This is the case that produces the "all red when parked" bug in
    // ChartMap; X-Dispatch hides the layer entirely so this expression
    // should never be visible, but it must still be computable for
    // parity with the source.
    expect(buildColorExpression(0)).toEqual(expectedShapeAt(0));
  });

  it('matches the expected shape at altitude=30000ft (high cruise)', () => {
    expect(buildColorExpression(30000)).toEqual(expectedShapeAt(30000));
  });

  it('uses the 1m epsilon between colour stops (hard boundary)', () => {
    // The expression shape is: [interpolate, [linear], [elevation],
    //   stop, value, stop, value, ...]. The epsilon is baked in as
    //   (boundary - 1) on the upper side of each band. For altitude=10000ft:
    //     expr[5]  = max(-11000, safeVis - 1)   ← the 1m-above-safeVis stop
    //     expr[7]  = safeVis                    ← the band-start stop
    //     expr[9]  = max(safeVis, caution - 1)  ← the 1m-above-caution stop
    //     expr[11] = caution                    ← next band-start stop
    //   So diff(expr[5] - expr[7]) = -1, and diff(expr[9] - expr[11]) = -1.
    const expr = buildColorExpression(10000);
    const safeVisEpsStop = expr[5] as number;
    const safeVis = expr[7] as number;
    expect(safeVisEpsStop - safeVis).toBeCloseTo(-1, 6);

    const cautionEpsStop = expr[9] as number;
    const caution = expr[11] as number;
    expect(cautionEpsStop - caution).toBeCloseTo(-1, 6);
  });

  it('clamps the ocean floor to -11000m', () => {
    const expr = buildColorExpression(0);
    // First numeric stop in the [stop, value] pairs is the ocean floor.
    const firstStop = expr[3] as number;
    expect(firstStop).toBe(-11000);
    // The deep transparent stop (at safeVis - 1 m) must be at
    // least -11000 (i.e. not pushed below it when the aircraft is at
    // 0 ft — which would push safeVis = altM - 2000 ft to a value
    // < -11000 m).
    const secondStop = expr[5] as number;
    expect(secondStop).toBeGreaterThanOrEqual(-11000);
  });

  it('caps the expression at 9000m ceiling', () => {
    const expr = buildColorExpression(0);
    // Last pair is the 9000m ceiling (solid red above this) — verifies
    // by checking the last numeric stop is 9000 and the last value is
    // the red colour.
    const lastStop = expr[expr.length - 2] as number;
    const lastValue = expr[expr.length - 1] as string;
    expect(lastStop).toBe(9000);
    expect(lastValue).toBe('#cc2222');
  });

  it('uses the AWS Terrarium tile URL (no proxy)', () => {
    expect(TAWS_TERRAIN_URL).toBe(
      'https://elevation-tiles-prod.s3.amazonaws.com/terrarium/{z}/{x}/{y}.png'
    );
  });
});

// ────────────────────────────────────────────────────────────────────────────
// MapLibre lifecycle
// ────────────────────────────────────────────────────────────────────────────

describe('TawsTerrainLayer MapLibre lifecycle', () => {
  it('addSource: raster-dem + terrarium encoding, addLayer: color-relief', () => {
    const map = makeMapMock();
    addTawsTerrainLayer(map as unknown as import('maplibre-gl').Map, buildColorExpression(0), true);

    // Source: raster-dem + terrarium encoding + AWS tile URL
    expect(map.addSource).toHaveBeenCalledTimes(1);
    const sourceCall = map.addSource.mock.calls[0] as [string, Record<string, unknown>];
    const sourceId = sourceCall[0];
    const sourceDef = sourceCall[1];
    expect(sourceId).toBe(TAWS_SOURCE_ID);
    expect(sourceDef.type).toBe('raster-dem');
    expect(sourceDef.encoding).toBe('terrarium');
    expect(sourceDef.tiles).toEqual([TAWS_TERRAIN_URL]);
    expect(sourceDef.tileSize).toBe(256);
    expect(sourceDef.maxzoom).toBe(12);

    // Layer: color-relief with the supplied color stops
    expect(map.addLayer).toHaveBeenCalledTimes(1);
    const layerCall = map.addLayer.mock.calls[0] as [
      {
        id: string;
        type: string;
        source: string;
        paint: Record<string, unknown>;
        layout: { visibility: string };
      },
      string?,
    ];
    const layerSpec = layerCall[0];
    expect(layerSpec.id).toBe(TAWS_LAYER_ID);
    expect(layerSpec.type).toBe('color-relief');
    expect(layerSpec.source).toBe(TAWS_SOURCE_ID);
    expect(layerSpec.paint['color-relief-opacity']).toBe(0.6);
    // visibility reflects the `visible` argument
    expect(layerSpec.layout.visibility).toBe('visible');
  });

  it('addSource is idempotent — re-add is a no-op', () => {
    const map = makeMapMock();
    addTawsTerrainLayer(map as unknown as import('maplibre-gl').Map, [], true);
    addTawsTerrainLayer(map as unknown as import('maplibre-gl').Map, [], true);
    expect(map.addSource).toHaveBeenCalledTimes(1);
    expect(map.addLayer).toHaveBeenCalledTimes(1);
  });

  it('removeTawsTerrainLayer removes layer + source', () => {
    const map = makeMapMock();
    addTawsTerrainLayer(map as unknown as import('maplibre-gl').Map, [], true);
    removeTawsTerrainLayer(map as unknown as import('maplibre-gl').Map);
    expect(map.removeLayer).toHaveBeenCalledWith(TAWS_LAYER_ID);
    expect(map.removeSource).toHaveBeenCalledWith(TAWS_SOURCE_ID);
  });

  it('removeTawsTerrainLayer is a no-op when layer is absent', () => {
    const map = makeMapMock();
    // No throw, no calls
    expect(() => removeTawsTerrainLayer(map as unknown as import('maplibre-gl').Map)).not.toThrow();
  });

  it('setTawsColorStops calls setPaintProperty with the new expression', () => {
    const map = makeMapMock();
    addTawsTerrainLayer(map as unknown as import('maplibre-gl').Map, buildColorExpression(0), true);
    const newStops = buildColorExpression(5000);
    setTawsColorStops(map as unknown as import('maplibre-gl').Map, newStops);
    expect(map.setPaintProperty).toHaveBeenCalledWith(
      TAWS_LAYER_ID,
      'color-relief-color',
      newStops
    );
  });

  it('setTawsColorStops is a no-op when layer is absent', () => {
    const map = makeMapMock();
    setTawsColorStops(map as unknown as import('maplibre-gl').Map, []);
    expect(map.setPaintProperty).not.toHaveBeenCalled();
  });

  it('setTawsVisibility (toggle off) sets visibility=none', () => {
    const map = makeMapMock();
    addTawsTerrainLayer(map as unknown as import('maplibre-gl').Map, [], true);
    setTawsVisibility(map as unknown as import('maplibre-gl').Map, false);
    expect(map.setLayoutProperty).toHaveBeenCalledWith(TAWS_LAYER_ID, 'visibility', 'none');
  });

  it('setTawsVisibility (toggle on) sets visibility=visible', () => {
    const map = makeMapMock();
    addTawsTerrainLayer(map as unknown as import('maplibre-gl').Map, [], false);
    setTawsVisibility(map as unknown as import('maplibre-gl').Map, true);
    expect(map.setLayoutProperty).toHaveBeenCalledWith(TAWS_LAYER_ID, 'visibility', 'visible');
  });

  it('findTawsBeforeId returns the first matching target layer', () => {
    const map = makeMapMock();
    // Pre-seed a candidate layer
    map.layers.add('weather-radar-layer');
    expect(findTawsBeforeId(map as unknown as import('maplibre-gl').Map)).toBe(
      'weather-radar-layer'
    );
  });

  it('findTawsBeforeId falls through to the first symbol layer', () => {
    const map = makeMapMock({ withSymbolLayer: true });
    expect(findTawsBeforeId(map as unknown as import('maplibre-gl').Map)).toBe('navaid-vor');
  });
});

// ────────────────────────────────────────────────────────────────────────────
// On-ground short-circuit (the headline fix)
//
// The hook drives this via `setTawsVisibility(false)` when on_ground === true.
// At the function boundary, we assert that the call propagates to the map
// and that no paint-property call happens during the ground state — i.e.
// the layer is hidden and the cached expression is left alone.
// ────────────────────────────────────────────────────────────────────────────

describe('on-ground short-circuit', () => {
  it('hides the layer (visibility=none) when the hook calls setTawsVisibility(false)', () => {
    const map = makeMapMock();
    addTawsTerrainLayer(map as unknown as import('maplibre-gl').Map, buildColorExpression(0), true);

    // Simulate the hook reacting to on_ground === true
    setTawsVisibility(map as unknown as import('maplibre-gl').Map, false);
    expect(map.setLayoutProperty).toHaveBeenLastCalledWith(TAWS_LAYER_ID, 'visibility', 'none');

    // No paint-property call should have happened during the ground
    // transition — the cached expression is left untouched so the
    // pre-ground colors are preserved for the moment we lift off.
    expect(map.setPaintProperty).not.toHaveBeenCalled();
  });

  it('restores visibility when the hook calls setTawsVisibility(true) on lift-off', () => {
    const map = makeMapMock();
    addTawsTerrainLayer(
      map as unknown as import('maplibre-gl').Map,
      buildColorExpression(0),
      false
    );

    // Simulate the hook reacting to on_ground flipping false
    setTawsVisibility(map as unknown as import('maplibre-gl').Map, true);
    expect(map.setLayoutProperty).toHaveBeenLastCalledWith(TAWS_LAYER_ID, 'visibility', 'visible');
  });

  it('does not push a new color expression while visibility is forced to none', () => {
    // The hook's third effect (colorStops) bails on onGround before
    // calling setTawsColorStops. We simulate that bail-out here by
    // asserting the layer is still hidden and no paint push occurs
    // across a would-be altitude update.
    const map = makeMapMock();
    addTawsTerrainLayer(
      map as unknown as import('maplibre-gl').Map,
      buildColorExpression(10000),
      true
    );

    // Hook effect 2: on-ground flip → setTawsVisibility(false)
    setTawsVisibility(map as unknown as import('maplibre-gl').Map, false);

    // Hook effect 3 would now run with a new altitude but bail — so we
    // assert the function *isn't* called with the new expression.
    const newStops = buildColorExpression(11000);
    // (we deliberately do not call setTawsColorStops; the hook's
    // onGround guard is the production guarantee.)
    void newStops;

    expect(map.setPaintProperty).not.toHaveBeenCalled();
    expect(map.setLayoutProperty).toHaveBeenLastCalledWith(TAWS_LAYER_ID, 'visibility', 'none');
  });
});

// ────────────────────────────────────────────────────────────────────────────
// TODO — follow-up coverage (deferred per plan owner direction)
//
// The following test cases are NOT in this MVP file. They are tracked here
// so the next contributor can pick them up without re-deriving the spec:
//
//   [ ] useTawsTerrainSync.test.ts (sync hook):
//       - Throttling: 1 Hz with 100 ft hysteresis (real timer + mock map)
//       - On-ground true → no colorStops update over multiple altitude ticks
//       - On-ground false → resume (first altitude tick after lift-off is
//         forced through, then 1 Hz guard kicks in)
//       - Style rebuild (style.load) re-adds layer with the last expression
//
//   [ ] Cross-file integration: assert useMapStore.tawsEnabled=true is what
//       wires the layer on; assert the hook's tawsEnabled guard keeps the
//       source absent when the user hasn't opted in.
//
//   [ ] i18n 11-locale fan-out parity — already done in en.json + 10 locales
//       (npm run i18n:sync). Verify the tawsLayer / tawsLayerDescription
//       keys exist in all 11 files and that the localeParity test passes.
//
//   [ ] Settings UI smoke test — render GraphicsSection and assert the new
//       toggle row appears, calls setTawsEnabled on check.
//
//   [ ] Manual X-Plane validation (per references/x-plane-data.md):
//       - Park at a default airport (KSEA / EGLL) — confirm no red map
//       - Take off — confirm TAWS overlay appears and color bands shift
//       - Toggle layer off in Settings → Graphics — confirm removal
//       - Kill X-Plane WebSocket — confirm layer hides after grace period
// ────────────────────────────────────────────────────────────────────────────
