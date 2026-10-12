import { useEffect } from 'react';
import type { Airport } from '@/lib/xplaneServices/dataService';
import type { VatsimData } from '@/types/vatsim';
import {
  bringVatsimAirportAtcLayersToTop,
  removeVatsimAirportAtcLayer,
  setupVatsimAirportAtcClickHandler,
  updateVatsimAirportAtcLayer,
} from '../layers';
import type { MapRef } from './useMapSetup';

export function useVatsimAirportAtcSync({
  mapRef,
  airports,
  vatsimData,
  vatsimEnabled,
}: {
  mapRef: MapRef;
  airports: Airport[];
  vatsimData: VatsimData | undefined;
  vatsimEnabled: boolean;
}): void {
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    if (!vatsimEnabled) {
      removeVatsimAirportAtcLayer(map);
      return;
    }

    const render = () => {
      if (!map.isStyleLoaded()) {
        map.once('styledata', render);
        return;
      }

      updateVatsimAirportAtcLayer(map, airports, vatsimData);
      bringVatsimAirportAtcLayersToTop(map);
      setupVatsimAirportAtcClickHandler(map);
    };

    render();
  }, [mapRef, airports, vatsimData, vatsimEnabled]);
}
