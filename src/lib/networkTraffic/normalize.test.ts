import { describe, expect, it } from 'vitest';
import type { IvaoPilot } from '@/types/ivao';
import type { VatsimPilot } from '@/types/vatsim';
import { fromIvaoPilot, fromVatsimPilot, parseFiledAltitudeFt, pilotsInBounds } from './normalize';

const vatsimPilot: VatsimPilot = {
  cid: 123,
  name: 'Jane Doe',
  callsign: 'BAW12',
  server: 'UK',
  pilot_rating: 1,
  latitude: 51.5,
  longitude: -0.4,
  altitude: 35000,
  groundspeed: 450,
  transponder: '2000',
  heading: 270,
  qnh_i_hg: 29.92,
  qnh_mb: 1013,
  flight_plan: {
    flight_rules: 'I',
    aircraft: 'A320/M-SDE2E3FGHIRWXY/LB1',
    aircraft_faa: 'A320',
    aircraft_short: 'A320',
    departure: 'EGLL',
    arrival: 'LFPG',
    alternate: 'LFPO',
    cruise_tas: '450',
    altitude: 'FL350',
    deptime: '1200',
    enroute_time: '0100',
    fuel_time: '0300',
    remarks: '',
    route: ' DET L6 DVR ',
    assigned_transponder: '2000',
  },
  logon_time: '',
  last_updated: '',
};

const ivaoPilot: IvaoPilot = {
  id: 77,
  userId: 555,
  callsign: 'AFR1',
  serverId: 'EU',
  softwareTypeId: 'xplane',
  softwareVersion: '12',
  rating: 3,
  createdAt: '',
  updatedAt: '',
  lastTrack: {
    latitude: 48.9,
    longitude: 2.5,
    altitude: 1200,
    altitudeDifference: 0,
    arrivalDistance: null,
    departureDistance: null,
    groundSpeed: 20,
    heading: 90,
    onGround: true,
    state: 'Boarding',
    time: 0,
    timestamp: '',
    transponder: 712,
    transponderMode: 'N',
  },
  flightPlan: {
    aircraftId: 'B738',
    alternateId: 'LFPO',
    alternative2Id: '',
    arrivalId: 'EGLL',
    cruiseLevel: 'F360',
    cruiseSpeed: 'N0450',
    departureId: 'LFPG',
    eet: 3600,
    endurance: 7200,
    flightRules: 'I',
    flightType: 'S',
    level: 'F360',
    remarks: '',
    revision: 1,
    route: 'ABB UL10 DVR',
    speed: 'N0450',
  },
};

describe('parseFiledAltitudeFt', () => {
  it('reads flight levels, altitudes and plain feet', () => {
    expect(parseFiledAltitudeFt('FL350')).toBe(35000);
    expect(parseFiledAltitudeFt('F350')).toBe(35000);
    expect(parseFiledAltitudeFt('A050')).toBe(5000);
    expect(parseFiledAltitudeFt('35000')).toBe(35000);
  });
  it('is null for VFR and junk', () => {
    expect(parseFiledAltitudeFt('VFR')).toBeNull();
    expect(parseFiledAltitudeFt('')).toBeNull();
    expect(parseFiledAltitudeFt(null)).toBeNull();
  });
});

describe('fromVatsimPilot', () => {
  it('maps the feed onto the shared pilot', () => {
    const p = fromVatsimPilot(vatsimPilot);
    expect(p).toMatchObject({
      network: 'vatsim',
      id: 123,
      callsign: 'BAW12',
      altitudeFt: 35000,
      groundspeedKts: 450,
      headingDeg: 270,
      transponder: '2000',
      onGround: false,
    });
    expect(p.flightPlan).toEqual({
      flightRules: 'IFR',
      aircraft: 'A320',
      departure: 'EGLL',
      arrival: 'LFPG',
      alternate: 'LFPO',
      cruiseAltitudeFt: 35000,
      route: 'DET L6 DVR',
    });
  });
  it('infers the ground from a slow ground speed and keeps a missing plan null', () => {
    const p = fromVatsimPilot({ ...vatsimPilot, groundspeed: 12, flight_plan: null });
    expect(p.onGround).toBe(true);
    expect(p.flightPlan).toBeNull();
  });
});

describe('fromIvaoPilot', () => {
  it('maps the feed, pads the squawk and keeps the ground flag', () => {
    const p = fromIvaoPilot(ivaoPilot);
    expect(p).toMatchObject({
      network: 'ivao',
      id: 77,
      callsign: 'AFR1',
      transponder: '0712',
      onGround: true,
    });
    expect(p?.flightPlan).toMatchObject({
      flightRules: 'IFR',
      aircraft: 'B738',
      departure: 'LFPG',
      arrival: 'EGLL',
      cruiseAltitudeFt: 36000,
    });
  });
  it('drops a session without a position', () => {
    expect(fromIvaoPilot({ ...ivaoPilot, lastTrack: null })).toBeNull();
  });
});

describe('pilotsInBounds', () => {
  it('keeps pilots inside the box only', () => {
    const inside = fromVatsimPilot(vatsimPilot);
    const outside = fromVatsimPilot({ ...vatsimPilot, cid: 2, latitude: 10 });
    const kept = pilotsInBounds([inside, outside], { north: 60, south: 40, east: 10, west: -10 });
    expect(kept.map((p) => p.id)).toEqual([123]);
  });
});
