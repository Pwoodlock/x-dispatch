import { describe, expect, it, vi } from 'vitest';
import type { PlanePosition } from '@/types/xplane';
import {
  TREND_VECTOR_SECONDS,
  addPlaneLayer,
  createGeoJSON,
  removePlaneLayer,
  updatePlaneLayer,
} from './PlaneLayer';
import { OWNSHIP_ICON_ID, airplaneOutline, createOwnshipIcon } from './ownshipIcon';

vi.mock('@/lib/map/labelFonts', () => ({ labelFont: () => ['Noto Sans Regular'] }));

type MlMap = import('maplibre-gl').Map;

function makeMapMock() {
  const layers = new Map<string, { id: string; layout?: Record<string, unknown> }>();
  const sources = new Map<string, { setData: ReturnType<typeof vi.fn> }>();
  const images = new Set<string>();
  return {
    layers,
    sources,
    images,
    getStyle: () => ({ layers: [], sources: {} }),
    getLayer: (id: string) => layers.get(id),
    getSource: (id: string) => sources.get(id),
    addLayer: (spec: { id: string; layout?: Record<string, unknown> }) => layers.set(spec.id, spec),
    addSource: (id: string) => sources.set(id, { setData: vi.fn() }),
    removeLayer: (id: string) => layers.delete(id),
    removeSource: (id: string) => sources.delete(id),
    hasImage: (id: string) => images.has(id),
    addImage: vi.fn((id: string) => images.add(id)),
    removeImage: (id: string) => images.delete(id),
    moveLayer: vi.fn(),
  };
}

function position(over: Partial<PlanePosition> = {}): PlanePosition {
  return {
    lat: 47.4,
    lng: 8.5,
    altitude: 3500,
    altitudeAGL: 2000,
    heading: 90,
    groundspeed: 110,
    aircraftCategory: 'ga',
    icaoType: 'C172',
    tailNumber: 'HB-ABC',
    wingspanM: 11,
    ...over,
  };
}

describe('ownship icon geometry', () => {
  it('is a closed, left-right symmetric polygon with the nose on top', () => {
    const pts = airplaneOutline();
    expect(pts[0]).toEqual([0.5, 0.03]);
    const xs = pts.map(([x]) => x);
    expect(Math.min(...xs)).toBeCloseTo(1 - Math.max(...xs), 5);
    // Every point on the right has its mirror on the left.
    for (const [x, y] of pts) {
      expect(pts.some(([mx, my]) => Math.abs(mx - (1 - x)) < 1e-9 && my === y)).toBe(true);
    }
  });

  it('renders a transparent fallback outside the browser', () => {
    const icon = createOwnshipIcon('airplane');
    expect(icon.width).toBe(128);
    expect(icon.pixelRatio).toBe(2);
    expect(icon.data.length).toBe(128 * 128 * 4);
  });
});

describe('trend vector', () => {
  it('points along the heading, one minute ahead at the current groundspeed', () => {
    const fc = createGeoJSON(position({ heading: 90, groundspeed: 120 }));
    expect(fc.features).toHaveLength(2);
    const line = fc.features[1]!.geometry as GeoJSON.LineString;
    const [lng0, lat0] = line.coordinates[0]!;
    const [lng1, lat1] = line.coordinates[1]!;
    // Due east: latitude unchanged, longitude grows.
    expect(lat1!).toBeCloseTo(lat0!, 3);
    expect(lng1!).toBeGreaterThan(lng0!);
    // 120 kt for 60 s = 2 NM ≈ 0.049° of longitude at 47.4° N.
    const nm = (120 / 3600) * TREND_VECTOR_SECONDS;
    expect((lng1! - lng0!) * 60 * Math.cos((lat0! * Math.PI) / 180)).toBeCloseTo(nm, 2);
  });

  it('is omitted while parked', () => {
    expect(createGeoJSON(position({ groundspeed: 0 })).features).toHaveLength(1);
  });
});

describe('PlaneLayer', () => {
  it('adds vector, symbol and label layers, no glow or shadow, with the airplane icon', () => {
    const map = makeMapMock();
    addPlaneLayer(map as unknown as MlMap, position());

    expect([...map.layers.keys()]).toEqual([
      'player-plane-vector',
      'player-plane',
      'player-plane-label',
    ]);
    expect(map.addImage).toHaveBeenCalledWith(
      OWNSHIP_ICON_ID.airplane,
      expect.objectContaining({ pixelRatio: 2 }),
      { pixelRatio: 2 }
    );
    expect(map.layers.get('player-plane')?.layout?.['icon-image']).toBe(OWNSHIP_ICON_ID.airplane);
  });

  it('keeps the same on-screen size regardless of wingspan', () => {
    const small = makeMapMock();
    addPlaneLayer(small as unknown as MlMap, position({ wingspanM: 11 }));
    const heavy = makeMapMock();
    addPlaneLayer(heavy as unknown as MlMap, position({ wingspanM: 80 }));
    expect(small.layers.get('player-plane')?.layout?.['icon-size']).toEqual(
      heavy.layers.get('player-plane')?.layout?.['icon-size']
    );
  });

  it('only pushes data on a position update, and rebuilds when the category changes', () => {
    const map = makeMapMock();
    addPlaneLayer(map as unknown as MlMap, position());
    const source = map.sources.get('player-plane-source')!;

    updatePlaneLayer(map as unknown as MlMap, position({ heading: 180 }));
    expect(source.setData).toHaveBeenCalledTimes(1);
    expect(map.addImage).toHaveBeenCalledTimes(1);

    updatePlaneLayer(map as unknown as MlMap, position({ aircraftCategory: 'helicopter' }));
    expect(map.addImage).toHaveBeenCalledTimes(2);
    expect(map.images.has(OWNSHIP_ICON_ID.helicopter)).toBe(true);
    expect(map.layers.get('player-plane')?.layout?.['icon-image']).toBe(OWNSHIP_ICON_ID.helicopter);
  });

  it('removes layers and source cleanly', () => {
    const map = makeMapMock();
    addPlaneLayer(map as unknown as MlMap, position());
    removePlaneLayer(map as unknown as MlMap);
    expect(map.layers.size).toBe(0);
    expect(map.sources.size).toBe(0);
  });
});
