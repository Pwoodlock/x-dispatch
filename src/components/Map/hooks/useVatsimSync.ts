import { useEffect } from 'react';
import { VatsimData, getPilotsInBounds } from '@/queries/useVatsimQuery';
import {
  LayerManager,
  VATSIM_LAYER_IDS,
  removeVatsimPilotLayer,
  setupVatsimClickHandler,
  updateVatsimPilotLayer,
} from '../layers';
import type { MapRef, PopupRef } from './useMapSetup';

interface UseVatsimSyncOptions {
  mapRef: MapRef;
  vatsimPopupRef: PopupRef;
  vatsimData: VatsimData | undefined;
  vatsimEnabled: boolean;
  /** LayerManager instance for authoritative layer ordering (optional) */
  layerManager?: LayerManager | null;
}

export function useVatsimSync({
  mapRef,
  vatsimPopupRef,
  vatsimData,
  vatsimEnabled,
  layerManager,
}: UseVatsimSyncOptions): void {
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !vatsimEnabled) return;

    const updateVatsim = () => {
      if (!map.isStyleLoaded()) {
        map.once('styledata', updateVatsim);
        return;
      }

      const bounds = map.getBounds();
      const pilotsInView = getPilotsInBounds(vatsimData, {
        north: bounds.getNorthEast().lat,
        south: bounds.getSouthWest().lat,
        east: bounds.getNorthEast().lng,
        west: bounds.getSouthWest().lng,
      });

      updateVatsimPilotLayer(map, pilotsInView);
      if (vatsimPopupRef.current) {
        setupVatsimClickHandler(map, vatsimPopupRef.current);
      }

      // Bring VATSIM layers to top using LayerManager if available
      if (layerManager) {
        for (const id of VATSIM_LAYER_IDS) {
          if (layerManager.hasLayer(id)) {
            layerManager.bringToTop(id);
          }
        }
      }
    };

    const handleMoveEnd = () => {
      if (vatsimEnabled && vatsimData) updateVatsim();
    };

    map.on('moveend', handleMoveEnd);
    updateVatsim();

    return () => {
      map.off('moveend', handleMoveEnd);
    };
  }, [mapRef, vatsimPopupRef, vatsimData, vatsimEnabled, layerManager]);
}

export function toggleVatsimLayer(mapRef: MapRef, vatsimPopupRef: PopupRef, enable: boolean): void {
  const map = mapRef.current;
  if (!map) return;

  if (!enable) {
    removeVatsimPilotLayer(map);
  } else if (vatsimPopupRef.current) {
    setupVatsimClickHandler(map, vatsimPopupRef.current);
  }
}
