/**
 * Online ATC as part of the airport dot: a ring in the colour of the top position online, and
 * at label zoom a strip of role letters beside the ICAO, lit for the roles staffed and dim for
 * the rest, with the ATIS letter after them. No click target of its own: the airport is the
 * click.
 */
import type * as maplibregl from 'maplibre-gl';
import { AIRPORT_THEME_COLORS, type BasemapTheme } from '@/lib/map/basemapTheme';
import { labelFont } from '@/lib/map/labelFonts';
import {
  AIRPORT_STRIP_ROLES,
  ATC_ROLE_COLORS,
  ATC_ROLE_LETTERS,
} from '@/lib/networkTraffic/atcRoles';
import type { Airport } from '@/lib/xplaneServices/dataService';
import type { AirportStaffing, AtcRole } from '@/types/networkTraffic';
import { moveLayersToTop, safeAddGeoJSONSource } from '../types';

const SOURCE_ID = 'network-atc-source';
const RING_LAYER_ID = 'network-atc-ring';
const STRIP_LAYER_ID = 'network-atc-strip';
export const NETWORK_ATC_LAYER_IDS = [RING_LAYER_ID, STRIP_LAYER_ID];

type AtcFeatureProperties = {
  icao: string;
  top: AtcRole;
  del: boolean;
  gnd: boolean;
  twr: boolean;
  app: boolean;
  atis: string;
};

/** Just outside the airport halo at every zoom (see HALO_RADIUS in AirportsLayer). */
const RING_RADIUS: maplibregl.ExpressionSpecification = [
  'interpolate',
  ['linear'],
  ['zoom'],
  0,
  2.5,
  3,
  4,
  6,
  7,
  10,
  9.5,
  14,
  11,
];
const RING_WIDTH: maplibregl.ExpressionSpecification = [
  'interpolate',
  ['linear'],
  ['zoom'],
  0,
  1,
  6,
  1.5,
  12,
  2,
];
/** Small beside the bare dot from zoom 3, then the airport label's own size (8 → 12). */
const STRIP_SIZE: maplibregl.ExpressionSpecification = [
  'interpolate',
  ['linear'],
  ['zoom'],
  3,
  7,
  6,
  8,
  10,
  10,
  14,
  12,
];
/** Zoom from which airport labels show; below it the strip sits to the right of the dot. */
const LABEL_ZOOM = 6;

const RING_COLOR: maplibregl.ExpressionSpecification = [
  'match',
  ['get', 'top'],
  'APP',
  ATC_ROLE_COLORS.APP,
  'TWR',
  ATC_ROLE_COLORS.TWR,
  'GND',
  ATC_ROLE_COLORS.GND,
  'DEL',
  ATC_ROLE_COLORS.DEL,
  ATC_ROLE_COLORS.ATIS,
];

const ROLE_PROPERTY: Record<(typeof AIRPORT_STRIP_ROLES)[number], keyof AtcFeatureProperties> = {
  DEL: 'del',
  GND: 'gnd',
  TWR: 'twr',
  APP: 'app',
};

/** Letter sections: lit in the role colour when staffed, dim otherwise, then the ATIS letter. */
function stripTextField(dim: string): maplibregl.ExpressionSpecification {
  // Beside the label every role shows, lit when staffed and dim otherwise; beside the bare
  // dot, zoomed out, only the lit letters show.
  const full: unknown[] = ['format'];
  const litOnly: unknown[] = ['format'];
  for (const role of AIRPORT_STRIP_ROLES) {
    full.push(ATC_ROLE_LETTERS[role], {
      'text-color': ['case', ['get', ROLE_PROPERTY[role]], ATC_ROLE_COLORS[role], dim],
    });
    litOnly.push(['case', ['get', ROLE_PROPERTY[role]], ATC_ROLE_LETTERS[role], ''], {
      'text-color': ATC_ROLE_COLORS[role],
    });
  }
  const atis = ['case', ['!=', ['get', 'atis'], ''], ['concat', ' ', ['get', 'atis']], ''];
  full.push(atis, { 'text-color': ATC_ROLE_COLORS.ATIS });
  litOnly.push(atis, { 'text-color': ATC_ROLE_COLORS.ATIS });
  return [
    'step',
    ['zoom'],
    litOnly,
    LABEL_ZOOM,
    full,
  ] as unknown as maplibregl.ExpressionSpecification;
}

/** Offline letters at half strength of the label colour: present, but clearly not lit. */
function dimColor(theme: BasemapTheme): string {
  return AIRPORT_THEME_COLORS[theme].labelDefault === '#1a1a1a'
    ? 'rgba(26, 26, 26, 0.45)'
    : 'rgba(255, 255, 255, 0.45)';
}

export function createNetworkAtcGeoJSON(
  staffing: Record<string, AirportStaffing>,
  airports: Airport[]
): GeoJSON.FeatureCollection {
  const byIcao = new Map(airports.map((a) => [a.icao.toUpperCase(), a]));
  const features: GeoJSON.Feature[] = [];
  for (const s of Object.values(staffing)) {
    const airport = byIcao.get(s.icao);
    if (!airport) continue;
    const roles = new Set(s.roles);
    const properties: AtcFeatureProperties = {
      icao: s.icao,
      top: s.top,
      del: roles.has('DEL'),
      gnd: roles.has('GND'),
      twr: roles.has('TWR'),
      app: roles.has('APP'),
      atis: s.atisCode ?? '',
    };
    features.push({
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [airport.lon, airport.lat] },
      properties,
    });
  }
  return { type: 'FeatureCollection', features };
}

export function updateNetworkAtcLayer(
  map: maplibregl.Map,
  staffing: Record<string, AirportStaffing>,
  airports: Airport[],
  theme: BasemapTheme
): void {
  if (!map.getStyle()) return;
  safeAddGeoJSONSource(map, SOURCE_ID, createNetworkAtcGeoJSON(staffing, airports));
  const colors = AIRPORT_THEME_COLORS[theme];
  if (map.getLayer(RING_LAYER_ID)) {
    applyNetworkAtcTheme(map, theme);
    return;
  }

  map.addLayer({
    id: RING_LAYER_ID,
    type: 'circle',
    source: SOURCE_ID,
    paint: {
      'circle-radius': RING_RADIUS,
      'circle-color': 'transparent',
      'circle-opacity': 0,
      'circle-stroke-color': RING_COLOR,
      'circle-stroke-width': RING_WIDTH,
      'circle-stroke-opacity': 0.9,
    },
  });

  map.addLayer({
    id: STRIP_LAYER_ID,
    type: 'symbol',
    source: SOURCE_ID,
    // Appears with the airport label and sits to the right of it, on the same line.
    // Right of the dot while zoomed out; with the label, to the right of it on the same line.
    minzoom: 3,
    layout: {
      'text-field': stripTextField(dimColor(theme)),
      'text-font': labelFont(map, 'bold'),
      'text-size': STRIP_SIZE,
      'text-letter-spacing': 0.25,
      'text-anchor': ['step', ['zoom'], 'left', LABEL_ZOOM, 'top-left'],
      // Beside the label: its anchor line (top, 1.2em below the dot), past the four-letter
      // ICAO plus a gap.
      'text-offset': ['step', ['zoom'], ['literal', [1.1, 0]], LABEL_ZOOM, ['literal', [1.7, 1.2]]],
      'text-allow-overlap': false,
      'text-ignore-placement': true,
      'text-optional': true,
    },
    paint: {
      'text-halo-color': colors.labelHalo,
      'text-halo-width': 1.25,
    },
  });
}

/** Recolours the strip for the basemap after a style change. */
export function applyNetworkAtcTheme(map: maplibregl.Map, theme: BasemapTheme): void {
  if (!map.getLayer(STRIP_LAYER_ID)) return;
  map.setLayoutProperty(STRIP_LAYER_ID, 'text-field', stripTextField(dimColor(theme)));
  map.setPaintProperty(STRIP_LAYER_ID, 'text-halo-color', AIRPORT_THEME_COLORS[theme].labelHalo);
}

export function removeNetworkAtcLayer(map: maplibregl.Map): void {
  if (!map.getStyle()) return;
  for (const id of NETWORK_ATC_LAYER_IDS) {
    if (map.getLayer(id)) map.removeLayer(id);
  }
  if (map.getSource(SOURCE_ID)) map.removeSource(SOURCE_ID);
}

export function bringNetworkAtcLayersToTop(map: maplibregl.Map): void {
  moveLayersToTop(map, NETWORK_ATC_LAYER_IDS);
}
