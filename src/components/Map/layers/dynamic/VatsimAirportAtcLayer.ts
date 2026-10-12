import * as maplibregl from 'maplibre-gl';
import { buildAirportAtcSummaries } from '@/lib/vatsimSectors/match';
import type { Airport } from '@/lib/xplaneServices/dataService';
import { useMapStore } from '@/stores/mapStore';
import type { VatsimData } from '@/types/vatsim';
import { moveLayersToTop, safeAddGeoJSONSource } from '../types';
import { type PillImageOptions, ensurePillImage } from './badgeImages';

type AirportBadgeLetter = 'A' | 'D' | 'G' | 'T';

type AirportAtcFeatureProperties = {
  id: string;
  icao: string;
  badgeLetter: AirportBadgeLetter;
  imageId: string;
  offsetX: number;
};

type AirportAtcFeatureCollection = GeoJSON.FeatureCollection<
  GeoJSON.Point,
  AirportAtcFeatureProperties
>;

const SOURCE_ID = 'vatsim-airport-atc-source';
const BADGE_LAYER_ID = 'vatsim-airport-atc-badges';

const BADGE_STYLES: Record<
  AirportBadgeLetter,
  { backgroundColor: string; borderColor: string; textColor: string }
> = {
  D: { backgroundColor: '#13273d', borderColor: '#60a5fa', textColor: '#dbeafe' },
  G: { backgroundColor: '#0f2d22', borderColor: '#34d399', textColor: '#dcfce7' },
  T: { backgroundColor: '#34161b', borderColor: '#f87171', textColor: '#fee2e2' },
  A: { backgroundColor: '#39280f', borderColor: '#fbbf24', textColor: '#fef3c7' },
};

const clickHandlerSetup = new WeakSet<maplibregl.Map>();
/** Badge signature of the last upload, so the periodic VATSIM refresh skips
 * the setData when no airport's staffing changed. */
const badgeUploadMemo = new WeakMap<maplibregl.Map, string>();

export const AIRPORT_ATC_ICON_SIZE: maplibregl.DataDrivenPropertyValueSpecification<number> = [
  'interpolate',
  ['linear'],
  ['zoom'],
  4,
  0.9,
  8,
  1.2,
  12,
  1.7,
  15,
  2.1,
] as const;

export function getAirportAtcBadgeImageId(letter: AirportBadgeLetter): string {
  return `vatsim-airport-atc-badge-${letter.toLowerCase()}`;
}

const BADGE_WIDTH = 18;
const BADGE_OFFSET_Y = -22;
const BADGE_OFFSET_RANGE = 1000;

function badgeOffsetX(index: number, total: number): number {
  return (index - (total - 1) / 2) * BADGE_WIDTH;
}

export function getAirportAtcBadgeOptions(letter: AirportBadgeLetter): PillImageOptions {
  return {
    ...BADGE_STYLES[letter],
    fontSize: 11,
    height: 18,
    minWidth: 18,
    paddingX: 4,
    radius: 5,
    pixelRatio: 3,
  };
}

// The airport list changes rarely (startup, scenery resync) while this layer
// refreshes on every VATSIM poll — key the ICAO lookup on array identity.
const airportByIcaoCache = new WeakMap<Airport[], Map<string, Airport>>();
function getAirportByIcao(airports: Airport[]): Map<string, Airport> {
  let map = airportByIcaoCache.get(airports);
  if (!map) {
    map = new Map(airports.map((airport) => [airport.icao.toUpperCase(), airport]));
    airportByIcaoCache.set(airports, map);
  }
  return map;
}

function ensureAirportBadgeImages(map: maplibregl.Map): void {
  (Object.keys(BADGE_STYLES) as AirportBadgeLetter[]).forEach((badgeLetter) => {
    ensurePillImage(
      map,
      getAirportAtcBadgeImageId(badgeLetter),
      badgeLetter,
      getAirportAtcBadgeOptions(badgeLetter)
    );
  });
}

export function buildAirportAtcFeatureCollection(
  airports: Airport[],
  vatsimData: VatsimData | undefined
): AirportAtcFeatureCollection {
  const airportByIcao = getAirportByIcao(airports);
  const summaries = buildAirportAtcSummaries(vatsimData, airports);

  const features = summaries.flatMap((summary) => {
    const airport = airportByIcao.get(summary.icao);
    if (!airport || !summary.badges.length) {
      return [];
    }

    return summary.badges.map((badge, index) => {
      return {
        type: 'Feature' as const,
        geometry: { type: 'Point' as const, coordinates: [airport.lon, airport.lat] },
        properties: {
          id: `${summary.icao}-${badge.role}`,
          icao: summary.icao,
          badgeLetter: badge.letter,
          imageId: getAirportAtcBadgeImageId(badge.letter),
          offsetX: badgeOffsetX(index, summary.badges.length),
        },
      };
    });
  });

  return { type: 'FeatureCollection', features };
}

export function updateVatsimAirportAtcLayer(
  map: maplibregl.Map,
  airports: Airport[],
  vatsimData: VatsimData | undefined
): void {
  const collection = buildAirportAtcFeatureCollection(airports, vatsimData);
  // The badge upload is skipped when no airport's staffing changed.
  const uploadKey = collection.features.map((f) => f.properties.id).join('|');
  if (
    badgeUploadMemo.get(map) === uploadKey &&
    map.getSource(SOURCE_ID) &&
    map.getLayer(BADGE_LAYER_ID)
  ) {
    return;
  }
  badgeUploadMemo.set(map, uploadKey);

  safeAddGeoJSONSource(map, SOURCE_ID, collection);
  ensureAirportBadgeImages(map);

  if (!map.getLayer(BADGE_LAYER_ID)) {
    map.addLayer({
      id: BADGE_LAYER_ID,
      type: 'symbol',
      source: SOURCE_ID,
      layout: {
        'icon-image': ['get', 'imageId'],
        'icon-allow-overlap': true,
        'icon-ignore-placement': true,
        // MapLibre stringifies array-valued GeoJSON properties, so the offset
        // array is rebuilt from a numeric property.
        'icon-offset': [
          'interpolate',
          ['linear'],
          ['get', 'offsetX'],
          -BADGE_OFFSET_RANGE,
          ['literal', [-BADGE_OFFSET_RANGE, BADGE_OFFSET_Y]],
          BADGE_OFFSET_RANGE,
          ['literal', [BADGE_OFFSET_RANGE, BADGE_OFFSET_Y]],
        ],
        'icon-size': AIRPORT_ATC_ICON_SIZE,
      },
    });
  }
}

export function removeVatsimAirportAtcLayer(map: maplibregl.Map): void {
  badgeUploadMemo.delete(map);
  if (map.getLayer(BADGE_LAYER_ID)) map.removeLayer(BADGE_LAYER_ID);
  if (map.getSource(SOURCE_ID)) map.removeSource(SOURCE_ID);
}

export function bringVatsimAirportAtcLayersToTop(map: maplibregl.Map): void {
  moveLayersToTop(map, [BADGE_LAYER_ID]);
}

export function setupVatsimAirportAtcClickHandler(map: maplibregl.Map): void {
  if (clickHandlerSetup.has(map)) {
    return;
  }

  clickHandlerSetup.add(map);

  map.on('click', BADGE_LAYER_ID, (event) => {
    const icao = event.features?.[0]?.properties.icao;
    if (typeof icao === 'string' && icao) {
      useMapStore.getState().setVatsimSelection({ kind: 'airport', icao });
    }
  });

  map.on('mouseenter', BADGE_LAYER_ID, () => {
    map.getCanvas().style.cursor = 'pointer';
  });

  map.on('mouseleave', BADGE_LAYER_ID, () => {
    map.getCanvas().style.cursor = '';
  });
}
