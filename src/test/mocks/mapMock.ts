/**
 * Mock MapLibre map for testing LayerManager and sync hooks.
 * Provides realistic behavior without requiring a real MapLibre instance.
 */
import type * as maplibregl from 'maplibre-gl';
import { Mock, vi } from 'vitest';

export interface MockLayer {
  id: string;
  type: string;
  source?: string;
  visibility: 'visible' | 'none';
  minzoom?: number;
  maxzoom?: number;
}

export interface MockSource {
  id: string;
  type: string;
  data?: GeoJSON.FeatureCollection;
}

export interface CreateMockMapOptions {
  /** Layers to pre-populate */
  existingLayers?: MockLayer[];
  /** Sources to pre-populate */
  existingSources?: MockSource[];
  /** Whether isStyleLoaded should return true */
  styleLoaded?: boolean;
}

/**
 * Creates a mock MapLibre map for testing.
 */
export function createMockMap(options: CreateMockMapOptions = {}): ReturnType<typeof vi.fn> & {
  getLayer: Mock;
  addLayer: Mock;
  removeLayer: Mock;
  moveLayer: Mock;
  getSource: Mock;
  addSource: Mock;
  removeSource: Mock;
  setLayoutProperty: Mock;
  getLayoutProperty: Mock;
  isStyleLoaded: Mock;
  getStyle: Mock;
  getLayersOrder: Mock;
  once: Mock;
  on: Mock;
  off: Mock;
  getZoom: Mock;
  getCenter: Mock;
  getBounds: Mock;
  getProjection: Mock;
  querySourceFeatures: Mock;
  getTerrain: Mock;
  getCanvas: Mock;
} {
  const { existingLayers = [], existingSources = [], styleLoaded = true } = options;

  // Internal state
  const layers = new Map<string, MockLayer>();
  const sources = new Map<string, MockSource>();

  // Pre-populate
  for (const layer of existingLayers) {
    layers.set(layer.id, { ...layer });
  }
  for (const source of existingSources) {
    sources.set(source.id, { ...source });
  }

  const mockMap = {
    // Layer operations
    getLayer: vi.fn((id: string) => layers.get(id) ?? null),
    addLayer: vi.fn((spec: maplibregl.LayerSpecification, _beforeId?: string) => {
      const layer: MockLayer = {
        id: spec.id,
        type: spec.type,
        source: (spec as any).source,
        visibility: 'visible',
        minzoom: (spec as any).minzoom,
        maxzoom: (spec as any).maxzoom,
      };
      layers.set(spec.id, layer);
    }),
    removeLayer: vi.fn((id: string) => {
      layers.delete(id);
    }),
    moveLayer: vi.fn((id: string, _beforeId?: string) => {
      // In a real map, this would reorder layers
      // For mock, we just track that it was called
    }),

    // Source operations
    getSource: vi.fn((id: string) => sources.get(id) ?? null),
    addSource: vi.fn((id: string, spec: maplibregl.SourceSpecification) => {
      sources.set(id, { id, type: spec.type });
    }),
    removeSource: vi.fn((id: string) => {
      sources.delete(id);
    }),

    // Layout property
    setLayoutProperty: vi.fn((id: string, property: string, value: unknown) => {
      const layer = layers.get(id);
      if (layer && property === 'visibility') {
        layer.visibility = value as 'visible' | 'none';
      }
    }),
    getLayoutProperty: vi.fn((id: string, property: string) => {
      const layer = layers.get(id);
      if (layer && property === 'visibility') {
        return layer.visibility;
      }
      return undefined;
    }),

    // Style operations
    isStyleLoaded: vi.fn(() => styleLoaded),
    getStyle: vi.fn(() => ({
      layers: [...layers.values()],
      sources: Object.fromEntries(sources),
    })),
    getLayersOrder: vi.fn(() => [...layers.keys()]),

    // Style data event handling
    once: vi.fn((_event: string, callback: () => void) => {
      // Just call the callback immediately for testing
      setTimeout(callback, 0);
    }),
    on: vi.fn(),
    off: vi.fn(),

    // Other methods (stubbed)
    getZoom: vi.fn(() => 10),
    getCenter: vi.fn(() => ({ lng: -6, lat: 53 })),
    getBounds: vi.fn(() => ({
      getNorthEast: () => ({ lat: 55, lng: -4 }),
      getSouthWest: () => ({ lat: 51, lng: -8 }),
    })),
    getProjection: vi.fn(() => ({ type: 'mercator' })),
    querySourceFeatures: vi.fn(() => []),
    getTerrain: vi.fn(() => null),
    getCanvas: vi.fn(() => ({
      style: { cursor: '' },
    })),
  };

  return mockMap;
}

/**
 * Creates a simple layer specification for testing.
 */
export function mockSpec(id: string, type: string = 'fill'): maplibregl.LayerSpecification {
  return {
    id,
    type: type as maplibregl.LayerSpecification['type'],
  } as maplibregl.LayerSpecification;
}

/**
 * Creates a mock GeoJSON source specification.
 */
export function mockGeoJSONSource(
  id: string,
  features: GeoJSON.Feature[] = []
): maplibregl.GeoJSONSourceSpecification {
  return {
    type: 'geojson',
    data: {
      type: 'FeatureCollection',
      features,
    },
  };
}
