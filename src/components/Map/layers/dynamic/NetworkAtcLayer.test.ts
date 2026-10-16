import { describe, expect, it } from 'vitest';
import type { Airport } from '@/lib/xplaneServices/dataService';
import type { AirportStaffing } from '@/types/networkTraffic';
import { createNetworkAtcGeoJSON } from './NetworkAtcLayer';

const airports = [{ icao: 'EGLL', name: 'Heathrow', lat: 51.47, lon: -0.46 }] as Airport[];

describe('createNetworkAtcGeoJSON', () => {
  it('puts one feature on each staffed airport with its lit roles and ATIS letter', () => {
    const staffing: Record<string, AirportStaffing> = {
      EGLL: {
        icao: 'EGLL',
        network: 'vatsim',
        stations: [],
        roles: ['GND', 'TWR'],
        top: 'TWR',
        atisCode: 'K',
      },
      ZZZZ: {
        icao: 'ZZZZ',
        network: 'vatsim',
        stations: [],
        roles: ['TWR'],
        top: 'TWR',
        atisCode: null,
      },
    };
    const fc = createNetworkAtcGeoJSON(staffing, airports);
    expect(fc.features).toHaveLength(1);
    expect(fc.features[0]?.geometry).toEqual({ type: 'Point', coordinates: [-0.46, 51.47] });
    expect(fc.features[0]?.properties).toEqual({
      icao: 'EGLL',
      top: 'TWR',
      del: false,
      gnd: true,
      twr: true,
      app: false,
      atis: 'K',
    });
  });
});
