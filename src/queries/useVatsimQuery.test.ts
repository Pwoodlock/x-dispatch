import { describe, expect, it } from 'vitest';
import type { VatsimData } from '@/types/vatsim';
import { getStaffedCallsignPrefixes } from './useVatsimQuery';

const data = {
  general: undefined,
  pilots: [],
  prefiles: [],
  controllers: [
    {
      cid: 1,
      name: 'Kennedy Tower',
      callsign: 'JFK_TWR',
      frequency: '119.100',
      facility: 4,
      rating: 8,
      server: 'USA-E',
      visual_range: 50,
      text_atis: null,
      last_updated: '',
      logon_time: '',
    },
  ],
  atis: [
    {
      cid: 2,
      name: 'Kennedy ATIS',
      callsign: 'JFK_ATIS',
      frequency: '128.725',
      facility: 0,
      rating: 8,
      server: 'USA-E',
      visual_range: 0,
      atis_code: 'B',
      text_atis: ['ATIS INFO B'],
      last_updated: '',
      logon_time: '',
    },
  ],
  lastUpdate: new Date('2026-05-05T00:00:00.000Z'),
} satisfies VatsimData;

describe('airport VATSIM helpers', () => {
  it('collects staffed callsign prefixes from controllers and ATIS', () => {
    expect(getStaffedCallsignPrefixes(data)).toEqual(new Set(['JFK']));
    expect(getStaffedCallsignPrefixes(undefined)).toEqual(new Set());
  });
});
