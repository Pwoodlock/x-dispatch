/**
 * Unit tests for LayerManager class.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createMockMap, mockSpec } from '@/test/mocks/mapMock';
import { type LayerCategory, LayerManager } from '../LayerManager';

describe('LayerManager', () => {
  let mockMap: ReturnType<typeof createMockMap>;
  let layerManager: LayerManager;

  beforeEach(() => {
    mockMap = createMockMap();
    layerManager = new LayerManager(mockMap);
  });

  describe('constructor', () => {
    it('should create a LayerManager instance', () => {
      expect(layerManager).toBeDefined();
    });

    it('should initialize with empty layer tracking', () => {
      expect(layerManager.getAllLayers()).toEqual([]);
    });
  });

  describe('addLayer()', () => {
    it('should add a layer to the map', () => {
      const spec = mockSpec('test-layer', 'fill');

      layerManager.addLayer('test-layer', 'nav', spec);

      expect(mockMap.addLayer).toHaveBeenCalledWith(spec, undefined);
    });

    it('should track the layer', () => {
      const spec = mockSpec('test-layer', 'fill');

      layerManager.addLayer('test-layer', 'nav', spec);

      expect(layerManager.hasLayer('test-layer')).toBe(true);
    });

    it('should associate layer with correct category', () => {
      layerManager.addLayer('airport-runway', 'airport', mockSpec('airport-runway'));
      layerManager.addLayer('nav-airspace', 'nav', mockSpec('nav-airspace'));

      expect(layerManager.getCategoryOf('airport-runway')).toBe('airport');
      expect(layerManager.getCategoryOf('nav-airspace')).toBe('nav');
    });

    it('should remove existing layer with same id (idempotent)', () => {
      const spec1 = mockSpec('test-layer', 'fill');
      const spec2 = mockSpec('test-layer', 'line');

      layerManager.addLayer('test-layer', 'nav', spec1);
      layerManager.addLayer('test-layer', 'nav', spec2);

      expect(mockMap.removeLayer).toHaveBeenCalledWith('test-layer');
      expect(mockMap.addLayer).toHaveBeenCalledTimes(2);
    });
  });

  describe('removeLayer()', () => {
    it('should remove layer from map', () => {
      layerManager.addLayer('test-layer', 'nav', mockSpec('test-layer'));

      layerManager.removeLayer('test-layer');

      expect(mockMap.removeLayer).toHaveBeenCalledWith('test-layer');
    });

    it('should remove layer from tracking', () => {
      layerManager.addLayer('test-layer', 'nav', mockSpec('test-layer'));

      layerManager.removeLayer('test-layer');

      expect(layerManager.hasLayer('test-layer')).toBe(false);
      expect(layerManager.getCategoryOf('test-layer')).toBeNull();
    });

    it('should not throw if layer does not exist', () => {
      expect(() => layerManager.removeLayer('non-existent')).not.toThrow();
    });
  });

  describe('layer ordering', () => {
    it('should use correct beforeId for category ordering', () => {
      // Add nav layer first
      layerManager.addLayer('nav-airspace', 'nav', mockSpec('nav-airspace'));
      // Add airport layer - should use nav-airspace as beforeId
      layerManager.addLayer('airport-runway', 'airport', mockSpec('airport-runway'));

      // Check the addLayer calls
      const addCalls = mockMap.addLayer.mock.calls;

      // Both layers should be added
      expect(addCalls).toHaveLength(2);

      // Find the airport call
      const airportCall = addCalls.find((c) => c[0].id === 'airport-runway');
      expect(airportCall).toBeDefined();
      expect(airportCall![1]).toBe('nav-airspace'); // beforeId
    });

    it('should find next category layer for beforeId', () => {
      layerManager.addLayer('dynamic-vatsim', 'dynamic', mockSpec('dynamic-vatsim'));
      layerManager.addLayer('nav-navaids', 'nav', mockSpec('nav-navaids'));

      const addCalls = mockMap.addLayer.mock.calls;

      // Find the nav call
      const navCall = addCalls.find((c) => c[0].id === 'nav-navaids');
      expect(navCall).toBeDefined();
      expect(navCall![1]).toBe('dynamic-vatsim'); // beforeId
    });
  });

  describe('bringToTop()', () => {
    it('should move layer within its category', () => {
      layerManager.addLayer('dynamic-vatsim', 'dynamic', mockSpec('dynamic-vatsim'));
      layerManager.addLayer('dynamic-ivao', 'dynamic', mockSpec('dynamic-ivao'));

      layerManager.bringToTop('dynamic-ivao');

      expect(mockMap.moveLayer).toHaveBeenCalledWith('dynamic-ivao');
    });

    it('should not move layer if not tracked', () => {
      layerManager.bringToTop('non-existent');
      expect(mockMap.moveLayer).not.toHaveBeenCalled();
    });
  });

  describe('setVisibility()', () => {
    it('should set visibility to visible', () => {
      mockMap.getLayer.mockReturnValue({} as any);
      layerManager.addLayer('test-layer', 'nav', mockSpec('test-layer'));

      layerManager.setVisibility('test-layer', true);

      expect(mockMap.setLayoutProperty).toHaveBeenCalledWith('test-layer', 'visibility', 'visible');
    });

    it('should set visibility to none', () => {
      mockMap.getLayer.mockReturnValue({} as any);
      layerManager.addLayer('test-layer', 'nav', mockSpec('test-layer'));

      layerManager.setVisibility('test-layer', false);

      expect(mockMap.setLayoutProperty).toHaveBeenCalledWith('test-layer', 'visibility', 'none');
    });

    it('should not throw if layer does not exist', () => {
      expect(() => layerManager.setVisibility('non-existent', true)).not.toThrow();
    });
  });

  describe('getLayersByCategory()', () => {
    it('should return all layers for a category', () => {
      layerManager.addLayer('nav-1', 'nav', mockSpec('nav-1'));
      layerManager.addLayer('nav-2', 'nav', mockSpec('nav-2'));
      layerManager.addLayer('airport-1', 'airport', mockSpec('airport-1'));

      const navLayers = layerManager.getLayersByCategory('nav');
      expect(navLayers).toContain('nav-1');
      expect(navLayers).toContain('nav-2');
      expect(navLayers).toHaveLength(2);
    });

    it('should return empty array for empty category', () => {
      const baseLayers = layerManager.getLayersByCategory('base');
      expect(baseLayers).toEqual([]);
    });
  });

  describe('getAllLayers()', () => {
    it('should return all tracked layers', () => {
      layerManager.addLayer('nav-1', 'nav', mockSpec('nav-1'));
      layerManager.addLayer('airport-1', 'airport', mockSpec('airport-1'));

      const allLayers = layerManager.getAllLayers();
      expect(allLayers).toContain('nav-1');
      expect(allLayers).toContain('airport-1');
      expect(allLayers).toHaveLength(2);
    });
  });

  describe('hasLayer()', () => {
    it('should return true for tracked layer', () => {
      layerManager.addLayer('test-layer', 'nav', mockSpec('test-layer'));
      expect(layerManager.hasLayer('test-layer')).toBe(true);
    });

    it('should return false for untracked layer', () => {
      expect(layerManager.hasLayer('non-existent')).toBe(false);
    });
  });

  describe('getCategoryOf()', () => {
    it('should return category for tracked layer', () => {
      layerManager.addLayer('test-layer', 'airport', mockSpec('test-layer'));
      expect(layerManager.getCategoryOf('test-layer')).toBe('airport');
    });

    it('should return null for untracked layer', () => {
      expect(layerManager.getCategoryOf('non-existent')).toBeNull();
    });
  });
});
