import { useEffect, useMemo } from 'react';
import type { BasemapTheme } from '@/lib/map/basemapTheme';
import { buildAirportStaffing } from '@/lib/networkTraffic/stations';
import type { Airport } from '@/lib/xplaneServices/dataService';
import { useMapStore } from '@/stores/mapStore';
import type { NetworkStation } from '@/types/networkTraffic';
import { removeNetworkAtcLayer, updateNetworkAtcLayer } from '../layers';
import type { MapRef } from './useMapSetup';

interface UseNetworkAtcSyncOptions {
  mapRef: MapRef;
  airports: Airport[];
  stations: NetworkStation[];
  theme: BasemapTheme;
}

/**
 * Keeps the staffed-airport marks on the map and the staffing table in the store, where the
 * hover tooltip and the airport panel read it. Empty stations clear both.
 */
export function useNetworkAtcSync({ mapRef, airports, stations, theme }: UseNetworkAtcSyncOptions) {
  const setAtcStaffing = useMapStore((s) => s.setAtcStaffing);
  const staffing = useMemo(() => buildAirportStaffing(stations, airports), [stations, airports]);

  useEffect(() => {
    setAtcStaffing(staffing);
  }, [staffing, setAtcStaffing]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    if (Object.keys(staffing).length === 0) {
      removeNetworkAtcLayer(map);
      return;
    }
    const render = () => {
      if (!map.isStyleLoaded()) {
        map.once('styledata', render);
        return;
      }
      updateNetworkAtcLayer(map, staffing, airports, theme);
    };
    render();
    return () => {
      map.off('styledata', render);
    };
  }, [mapRef, staffing, airports, theme]);

  useEffect(() => {
    const map = mapRef.current;
    return () => {
      if (map) removeNetworkAtcLayer(map);
      setAtcStaffing({});
    };
  }, [mapRef, setAtcStaffing]);
}
