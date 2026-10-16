import type * as maplibregl from 'maplibre-gl';
import { labelFont } from '@/lib/map/labelFonts';
import { destinationPoint } from '@/lib/utils/geomath';
import type { PlanePosition } from '@/types/xplane';
import { moveLayersToTop, safeAddGeoJSONSource } from '../types';
import { OWNSHIP_ICON_ID, type OwnshipIconKind, createOwnshipIcon } from './ownshipIcon';

const SOURCE_ID = 'player-plane-source';
const VECTOR_LAYER_ID = 'player-plane-vector';
const LAYER_ID = 'player-plane';
const LABEL_LAYER_ID = 'player-plane-label';
const ALL_LAYER_IDS = [VECTOR_LAYER_ID, LAYER_ID, LABEL_LAYER_ID];

// Design-system cyan (--primary #1DA0F2) for the trend vector and data label.
const CYAN = '#1DA0F2';

/**
 * Trend vector: where the aircraft will be in 60 s at the current groundspeed.
 * In map units, so it grows as you zoom in and vanishes zoomed out. Hidden
 * while parked so a stationary aircraft does not sprout a stub.
 */
export const TREND_VECTOR_SECONDS = 60;
const TREND_MIN_GROUNDSPEED_KT = 5;
const KT_TO_M_PER_S = 0.514444;

/**
 * Fixed on-screen size like every EFB from globe view to the terminal area
 * (roughly 29 → 42 px across the 64 px canvas), so it is never a blurry
 * blown-up sprite nor a 7 px dot. Past zoom 14 the map keeps growing under
 * it, so the symbol grows with it up to ~96 px and then holds; otherwise it
 * reads as a speck on the taxi map.
 */
const ICON_SIZE: maplibregl.ExpressionSpecification = [
  'interpolate',
  ['linear'],
  ['zoom'],
  6,
  0.45,
  14,
  0.65,
  20,
  1.5,
];

function iconKind(position: PlanePosition | null): OwnshipIconKind {
  return position?.aircraftCategory === 'helicopter' ? 'helicopter' : 'airplane';
}

export function createGeoJSON(position: PlanePosition | null): GeoJSON.FeatureCollection {
  if (!position) return { type: 'FeatureCollection', features: [] };
  const features: GeoJSON.Feature[] = [
    {
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [position.lng, position.lat] },
      properties: {
        heading: position.heading,
        altitude: Math.round(position.altitude),
        flightLevel: Math.round(position.altitude / 100),
        groundspeed: Math.round(position.groundspeed),
        label: position.tailNumber || position.icaoType,
      },
    },
  ];
  if (position.groundspeed >= TREND_MIN_GROUNDSPEED_KT) {
    const meters = position.groundspeed * KT_TO_M_PER_S * TREND_VECTOR_SECONDS;
    features.push({
      type: 'Feature',
      geometry: {
        type: 'LineString',
        coordinates: [
          [position.lng, position.lat],
          destinationPoint(position.lat, position.lng, meters, position.heading),
        ],
      },
      properties: {},
    });
  }
  return { type: 'FeatureCollection', features };
}

/** Which symbol the layer was built with, so a category change rebuilds it. */
const kindMemo = new WeakMap<maplibregl.Map, OwnshipIconKind>();

function ensureIcon(map: maplibregl.Map, kind: OwnshipIconKind): void {
  const id = OWNSHIP_ICON_ID[kind];
  if (map.hasImage(id)) return;
  const icon = createOwnshipIcon(kind);
  map.addImage(id, icon, { pixelRatio: icon.pixelRatio });
}

export function addPlaneLayer(map: maplibregl.Map, position: PlanePosition | null): void {
  if (!map.getStyle()) return;
  removePlaneLayer(map);

  const kind = iconKind(position);
  ensureIcon(map, kind);
  kindMemo.set(map, kind);

  safeAddGeoJSONSource(map, SOURCE_ID, createGeoJSON(position));

  map.addLayer({
    id: VECTOR_LAYER_ID,
    type: 'line',
    source: SOURCE_ID,
    filter: ['==', ['geometry-type'], 'LineString'],
    layout: { 'line-cap': 'round' },
    paint: { 'line-color': CYAN, 'line-width': 2, 'line-opacity': 0.9 },
  });

  map.addLayer({
    id: LAYER_ID,
    type: 'symbol',
    source: SOURCE_ID,
    filter: ['==', ['geometry-type'], 'Point'],
    layout: {
      'icon-image': OWNSHIP_ICON_ID[kind],
      'icon-size': ICON_SIZE,
      'icon-rotate': ['get', 'heading'],
      'icon-rotation-alignment': 'map',
      'icon-allow-overlap': true,
      'icon-ignore-placement': true,
    },
  });

  map.addLayer({
    id: LABEL_LAYER_ID,
    type: 'symbol',
    source: SOURCE_ID,
    filter: ['==', ['geometry-type'], 'Point'],
    minzoom: 7,
    layout: {
      'text-field': [
        'format',
        ['get', 'label'],
        { 'font-scale': 1 },
        '\n',
        {},
        [
          'concat',
          'FL',
          ['to-string', ['get', 'flightLevel']],
          '  ',
          ['to-string', ['get', 'groundspeed']],
          ' kt',
        ],
        { 'font-scale': 0.8 },
      ],
      'text-font': labelFont(map, 'semibold'),
      'text-size': ['interpolate', ['linear'], ['zoom'], 7, 10, 12, 12],
      'text-offset': [1.6, 0],
      'text-anchor': 'left',
      'text-allow-overlap': true,
      'text-ignore-placement': true,
    },
    paint: {
      'text-color': CYAN,
      'text-halo-color': 'rgba(0, 0, 0, 0.9)',
      'text-halo-width': 1.5,
    },
  });
}

export function removePlaneLayer(map: maplibregl.Map | null | undefined): void {
  if (!map || !map.getStyle()) return;
  try {
    for (const id of ALL_LAYER_IDS) {
      if (map.getLayer(id)) map.removeLayer(id);
    }
    if (map.getSource(SOURCE_ID)) map.removeSource(SOURCE_ID);
    kindMemo.delete(map);
  } catch {
    // Map might be in invalid state during unmount
  }
}

export function updatePlaneLayer(
  map: maplibregl.Map | null | undefined,
  position: PlanePosition | null
): void {
  if (!map || !map.getStyle()) return;
  try {
    const source = map.getSource(SOURCE_ID) as maplibregl.GeoJSONSource | undefined;
    if (!source) {
      if (position) addPlaneLayer(map, position);
      return;
    }
    if (kindMemo.get(map) !== iconKind(position)) {
      addPlaneLayer(map, position);
      return;
    }
    source.setData(createGeoJSON(position));
  } catch {
    // Map might be in invalid state
  }
}

export function bringPlaneLayerToTop(map: maplibregl.Map | null | undefined): void {
  if (!map) return;
  try {
    // Runs on every position snapshot, so it must no-op when already on top —
    // an unconditional moveLayer would force label placement 10x a second.
    moveLayersToTop(map, ALL_LAYER_IDS);
  } catch {
    // Map might be in invalid state
  }
}
