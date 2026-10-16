import { describe, expect, it } from 'vitest';
import type { FlightSummary } from '@/types/flightRecorder';
import { LOGBOOK_CSV_COLUMNS, flightsToCsv, parseCsvRows, parseFlightsCsv } from './logbookCsv';

const flight: FlightSummary = {
  id: 'abc-1',
  startedAt: Date.UTC(2026, 9, 16, 12, 0, 0),
  endedAt: Date.UTC(2026, 9, 16, 13, 30, 0),
  status: 'complete',
  aircraft: { icao: 'B738', name: 'Boeing 737-800, "Zibo"', livery: null },
  departure: { icao: 'LSZH', name: 'Zurich' },
  arrival: { icao: 'EGLL', name: 'London Heathrow' },
  blockTimeSec: 5400,
  airTimeSec: 4800,
  distanceNm: 420.5,
  maxAltFt: 36000,
  maxGroundspeedKt: 455,
  fuelStartKg: 9000,
  fuelEndKg: null,
  landing: null,
  landingCount: 1,
  pointCount: 5400,
  preview: [],
};

describe('flightsToCsv', () => {
  it('writes a header and one quoted row per flight', () => {
    const csv = flightsToCsv([flight]);
    const [header, row] = csv.split('\r\n');
    expect(header).toBe(LOGBOOK_CSV_COLUMNS.join(','));
    expect(row).toContain('abc-1,2026-10-16T12:00:00.000Z,2026-10-16T13:30:00.000Z,complete');
    expect(row).toContain('"Boeing 737-800, ""Zibo"""');
    expect(row).toContain(',9000,,1,,');
  });
});

describe('parseCsvRows', () => {
  it('handles quotes, embedded commas, line breaks, CRLF and a BOM', () => {
    const rows = parseCsvRows('﻿a,b\r\n"x, y","line\nbreak"\n"q""uote",\n\n');
    expect(rows).toEqual([
      ['a', 'b'],
      ['x, y', 'line\nbreak'],
      ['q"uote', ''],
    ]);
  });
});

describe('parseFlightsCsv', () => {
  it('round-trips an export', () => {
    const { flights, rejectedLines } = parseFlightsCsv(flightsToCsv([flight]));
    expect(rejectedLines).toEqual([]);
    expect(flights).toHaveLength(1);
    const back = flights[0]!;
    expect(back.id).toBe('abc-1');
    expect(back.startedAt).toBe(flight.startedAt);
    expect(back.endedAt).toBe(flight.endedAt);
    expect(back.departure).toEqual(flight.departure);
    expect(back.arrival).toEqual(flight.arrival);
    expect(back.aircraft).toEqual(flight.aircraft);
    expect(back.blockTimeSec).toBe(5400);
    expect(back.airTimeSec).toBe(4800);
    expect(back.distanceNm).toBe(420.5);
    expect(back.maxAltFt).toBe(36000);
    expect(back.fuelStartKg).toBe(9000);
    expect(back.fuelEndKg).toBeNull();
    expect(back.landingCount).toBe(1);
    expect(back.status).toBe('complete');
  });

  it('matches columns by name, invents ids and rejects rows without a start', () => {
    const text =
      'departure_icao,started_at,block_time_sec\r\n' +
      'eddf,2026-01-02T10:00:00Z,1200\r\n' +
      'egll,not a date,10\r\n';
    const { flights, rejectedLines } = parseFlightsCsv(text);
    expect(flights).toHaveLength(1);
    expect(flights[0]!.departure?.icao).toBe('EDDF');
    expect(flights[0]!.blockTimeSec).toBe(1200);
    expect(flights[0]!.id).toMatch(/^manual-/);
    expect(rejectedLines).toEqual([3]);
  });

  it('rejects a sheet without a started_at column', () => {
    expect(parseFlightsCsv('a,b\r\n1,2\r\n')).toEqual({ flights: [], rejectedLines: [1] });
    expect(parseFlightsCsv('')).toEqual({ flights: [], rejectedLines: [] });
  });
});
