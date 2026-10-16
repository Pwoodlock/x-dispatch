import type { FlightSummary } from '@/types/flightRecorder';
import { manualFlightId, newManualFlight } from './flightEdit';

/**
 * One row per flight, summaries only: the track and landing reports stay in the
 * flight files. Columns are matched by header name on import, so a sheet with
 * reordered or missing columns still loads.
 */
export const LOGBOOK_CSV_COLUMNS = [
  'id',
  'started_at',
  'ended_at',
  'status',
  'departure_icao',
  'departure_name',
  'arrival_icao',
  'arrival_name',
  'aircraft_icao',
  'aircraft_name',
  'livery',
  'block_time_sec',
  'air_time_sec',
  'distance_nm',
  'max_alt_ft',
  'max_groundspeed_kt',
  'fuel_start_kg',
  'fuel_end_kg',
  'landing_count',
  'touchdown_rate_fpm',
  'landing_rating',
] as const;

function cell(value: unknown): string {
  if (value === null || value === undefined) return '';
  const s = String(value);
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function isoOrEmpty(epochMs: number | null): string {
  return epochMs === null ? '' : new Date(epochMs).toISOString();
}

export function flightsToCsv(flights: FlightSummary[]): string {
  const lines = [LOGBOOK_CSV_COLUMNS.join(',')];
  for (const f of flights) {
    lines.push(
      [
        f.id,
        isoOrEmpty(f.startedAt),
        isoOrEmpty(f.endedAt),
        f.status,
        f.departure?.icao ?? '',
        f.departure?.name ?? '',
        f.arrival?.icao ?? '',
        f.arrival?.name ?? '',
        f.aircraft.icao ?? '',
        f.aircraft.name ?? '',
        f.aircraft.livery ?? '',
        f.blockTimeSec,
        f.airTimeSec,
        f.distanceNm,
        f.maxAltFt,
        f.maxGroundspeedKt,
        f.fuelStartKg ?? '',
        f.fuelEndKg ?? '',
        f.landingCount,
        f.landing?.touchdownRateFpm ?? '',
        f.landing?.rating ?? '',
      ]
        .map(cell)
        .join(',')
    );
  }
  return lines.join('\r\n') + '\r\n';
}

/** RFC 4180 rows: quoted fields may hold commas, quotes and line breaks. */
export function parseCsvRows(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;
  const src = text.startsWith('﻿') ? text.slice(1) : text;
  for (let i = 0; i < src.length; i++) {
    const c = src[i]!;
    if (quoted) {
      if (c === '"') {
        if (src[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          quoted = false;
        }
      } else {
        field += c;
      }
    } else if (c === '"') {
      quoted = true;
    } else if (c === ',') {
      row.push(field);
      field = '';
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && src[i + 1] === '\n') i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else {
      field += c;
    }
  }
  if (field.length || row.length) {
    row.push(field);
    rows.push(row);
  }
  return rows.filter((r) => r.some((v) => v.trim().length > 0));
}

function epoch(value: string | undefined): number | null {
  if (!value) return null;
  const n = Number(value);
  if (Number.isFinite(n) && value.trim() !== '') return n;
  const t = Date.parse(value);
  return Number.isFinite(t) ? t : null;
}

function optionalNumber(value: string | undefined): number | null {
  if (value === undefined || value.trim() === '') return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

export interface CsvImportResult {
  flights: FlightSummary[];
  /** 1-based line numbers of rows that could not be read. */
  rejectedLines: number[];
}

/**
 * Flights from a sheet in the export format. A row without a usable start time is
 * rejected; a missing id gets a fresh one. Track-derived fields that are not in the
 * sheet stay at their blank values.
 */
export function parseFlightsCsv(text: string): CsvImportResult {
  const rows = parseCsvRows(text);
  const result: CsvImportResult = { flights: [], rejectedLines: [] };
  const header = rows[0];
  if (!header) return result;
  const col = new Map(header.map((name, i) => [name.trim().toLowerCase(), i]));
  if (!col.has('started_at')) {
    result.rejectedLines.push(1);
    return result;
  }
  const get = (row: string[], name: string) => {
    const i = col.get(name);
    return i === undefined ? undefined : row[i];
  };
  for (let r = 1; r < rows.length; r++) {
    const row = rows[r]!;
    const startedAt = epoch(get(row, 'started_at'));
    if (startedAt === null) {
      result.rejectedLines.push(r + 1);
      continue;
    }
    const id = (get(row, 'id') ?? '').trim() || manualFlightId();
    const flight = newManualFlight(
      {
        startedAt,
        departureIcao: get(row, 'departure_icao'),
        departureName: get(row, 'departure_name'),
        arrivalIcao: get(row, 'arrival_icao'),
        arrivalName: get(row, 'arrival_name'),
        aircraftIcao: get(row, 'aircraft_icao'),
        aircraftName: get(row, 'aircraft_name'),
        livery: get(row, 'livery'),
        blockTimeSec: get(row, 'block_time_sec'),
        airTimeSec: get(row, 'air_time_sec'),
        distanceNm: get(row, 'distance_nm'),
        landingCount: get(row, 'landing_count'),
      },
      id
    );
    flight.endedAt = epoch(get(row, 'ended_at')) ?? flight.endedAt;
    flight.maxAltFt = optionalNumber(get(row, 'max_alt_ft')) ?? 0;
    flight.maxGroundspeedKt = optionalNumber(get(row, 'max_groundspeed_kt')) ?? 0;
    flight.fuelStartKg = optionalNumber(get(row, 'fuel_start_kg'));
    flight.fuelEndKg = optionalNumber(get(row, 'fuel_end_kg'));
    const status = get(row, 'status');
    if (status === 'aborted') flight.status = 'aborted';
    result.flights.push(flight);
  }
  return result;
}
