import { useMemo } from 'react';
import { fromIvaoPilot, fromVatsimPilot } from '@/lib/networkTraffic/normalize';
import { fromIvaoAtc, fromVatsimAtis, fromVatsimController } from '@/lib/networkTraffic/stations';
import { useMapStore } from '@/stores/mapStore';
import type { NetworkId, NetworkPilot, NetworkStation } from '@/types/networkTraffic';
import { useIvaoQuery } from './useIvaoQuery';
import { useVatsimQuery } from './useVatsimQuery';

const NO_PILOTS: NetworkPilot[] = [];
const NO_STATIONS: NetworkStation[] = [];

export interface NetworkTraffic {
  /** The network switched on, or null when neither is; the two never show together. */
  network: NetworkId | null;
  pilots: NetworkPilot[];
  stations: NetworkStation[];
}

/** The active network's pilots and controllers in the shared shape, refreshed with each poll. */
export function useNetworkTraffic(): NetworkTraffic {
  const vatsimEnabled = useMapStore((s) => s.vatsimEnabled);
  const ivaoEnabled = useMapStore((s) => s.ivaoEnabled);
  const network: NetworkId | null = vatsimEnabled ? 'vatsim' : ivaoEnabled ? 'ivao' : null;
  const { data: vatsimData } = useVatsimQuery(vatsimEnabled);
  const { data: ivaoData } = useIvaoQuery(ivaoEnabled);

  const pilots = useMemo<NetworkPilot[]>(() => {
    if (network === 'vatsim') return (vatsimData?.pilots ?? []).map(fromVatsimPilot);
    if (network === 'ivao') {
      return (ivaoData?.clients.pilots ?? []).flatMap((p) => {
        const pilot = fromIvaoPilot(p);
        return pilot ? [pilot] : [];
      });
    }
    return NO_PILOTS;
  }, [network, vatsimData, ivaoData]);

  const stations = useMemo<NetworkStation[]>(() => {
    if (network === 'vatsim' && vatsimData) {
      return [
        ...vatsimData.controllers.map(fromVatsimController),
        ...vatsimData.atis.map(fromVatsimAtis),
      ];
    }
    if (network === 'ivao') {
      return (ivaoData?.clients.atcs ?? []).flatMap((a) => {
        const station = fromIvaoAtc(a);
        return station ? [station] : [];
      });
    }
    return NO_STATIONS;
  }, [network, vatsimData, ivaoData]);

  return { network, pilots, stations };
}
