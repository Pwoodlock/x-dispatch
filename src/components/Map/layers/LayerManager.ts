/**
 * LayerManager - Authoritative layer ordering for MapLibre
 *
 * Problem: No central authority for layer ordering. Airport layers bury nav overlays.
 * Solution: LayerManager owns all layer ordering across 6 categories and is more friendly
 * for future features like layer groups, toggling visibility, and z-index control.
 *
 * Layer categories (bottom to top):
 * 1. base     - map tiles, raster basemap
 * 2. terrain  - hillshade, DEM
 * 3. airport  - runways, taxiways, gates, lights, signs
 * 4. nav      - airspaces, airways, navaids, ILS, holding patterns
 * 5. dynamic  - VATSIM, IVAO, flight plan, range rings, procedure route
 * 6. overlay  - canvas overlays (taxi route, approach lights) - excluded from LayerManager
 * 7. And so on.....
 */
import maplibregl from 'maplibre-gl';

/**
 * Layer categories for ordering. Higher categories render on top.
 */
export type LayerCategory = 'base' | 'terrain' | 'airport' | 'nav' | 'dynamic' | 'overlay';

/**
 * LayerManager owns all MapLibre layer ordering.
 * No component should call map.addLayer(), map.removeLayer(), or map.moveLayer() directly.
 * All layer operations go through LayerManager.
 */
export class LayerManager {
  private map: maplibregl.Map;
  private layersByCategory: Map<LayerCategory, Set<string>> = new Map();
  private categoryOrder: LayerCategory[] = [
    'base',
    'terrain',
    'airport',
    'nav',
    'dynamic',
    'overlay',
  ];

  constructor(map: maplibregl.Map) {
    this.map = map;
    // Initialize empty sets for each category
    this.categoryOrder.forEach((cat) => {
      this.layersByCategory.set(cat, new Set());
    });
  }

  /**
   * Authoritative layer addition.
   * Inserts layer at the correct position based on category ordering.
   * Categories higher in the stack render on top.
   */
  addLayer(
    id: string,
    category: LayerCategory,
    spec: maplibregl.LayerSpecification,
    options?: { beforeId?: string }
  ): void {
    // Remove existing layer if present (idempotent)
    if (this.map.getLayer(id)) {
      this.map.removeLayer(id);
    }

    // Determine insertion point:
    // Find the first layer from categories that come AFTER ours
    const categoryIdx = this.categoryOrder.indexOf(category);
    const layersAbove = this.categoryOrder
      .slice(categoryIdx + 1)
      .flatMap((c) => [...(this.layersByCategory.get(c) ?? [])])
      .find((layerId) => this.map.getLayer(layerId));

    // Use provided beforeId, or found layer above, or undefined (append to top)
    const beforeId = options?.beforeId ?? layersAbove;

    this.map.addLayer(spec, beforeId);
    this.layersByCategory.get(category)?.add(id);
  }

  /**
   * Authoritative layer removal.
   * Cleans up both the map layer and internal tracking.
   */
  removeLayer(id: string): void {
    // Remove from tracking
    for (const set of this.layersByCategory.values()) {
      set.delete(id);
    }
    // Remove from map
    if (this.map.getLayer(id)) {
      this.map.removeLayer(id);
    }
  }

  /**
   * Move a layer to the top of its category.
   * Only moves within its category - airport layers stay below nav, etc.
   */
  bringToTop(id: string): void {
    const category = this.getCategoryOf(id);
    if (!category) return;

    const set = this.layersByCategory.get(category);
    if (set) {
      set.delete(id);
      set.add(id);
    }
    if (this.map.getLayer(id)) {
      this.map.moveLayer(id);
    }
  }

  /**
   * Move a layer to the bottom of its category.
   */
  bringToBottom(id: string): void {
    const category = this.getCategoryOf(id);
    if (!category) return;

    const set = this.layersByCategory.get(category);
    if (set) {
      set.delete(id);
      set.add(id);
      // Move below all other layers in the category
      const allIds = [...set];
      for (const otherId of allIds) {
        if (otherId !== id && this.map.getLayer(otherId)) {
          this.map.moveLayer(id, otherId);
        }
      }
    }
  }

  /**
   * Get the category of a layer.
   */
  getCategoryOf(id: string): LayerCategory | null {
    for (const [cat, set] of this.layersByCategory.entries()) {
      if (set.has(id)) return cat;
    }
    return null;
  }

  /**
   * Set visibility of a layer.
   */
  setVisibility(id: string, visible: boolean): void {
    if (this.map.getLayer(id)) {
      this.map.setLayoutProperty(id, 'visibility', visible ? 'visible' : 'none');
    }
  }

  /**
   * Get all layer IDs for a category.
   */
  getLayersByCategory(category: LayerCategory): string[] {
    return [...(this.layersByCategory.get(category) ?? [])];
  }

  /**
   * Get all tracked layer IDs.
   */
  getAllLayers(): string[] {
    return this.categoryOrder.flatMap((cat) => this.getLayersByCategory(cat));
  }

  /**
   * Check if a layer is tracked.
   */
  hasLayer(id: string): boolean {
    return this.getCategoryOf(id) !== null;
  }
}
