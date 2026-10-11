import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { FlightInit } from '@/lib/xplaneServices/client/generated/xplaneApi';
import { reportFlightRejection, summarizeFlightInit } from './flightRejection';

const sentry = vi.hoisted(() => {
  const scope = {
    setFingerprint: vi.fn(),
    setTag: vi.fn(),
    setContext: vi.fn(),
  };
  return {
    scope,
    withScope: vi.fn((fn: (s: typeof scope) => void) => fn(scope)),
    captureMessage: vi.fn(),
  };
});

vi.mock('@sentry/electron/main', () => ({
  withScope: sentry.withScope,
  captureMessage: sentry.captureMessage,
}));

vi.mock('@/lib/utils/logger', () => ({
  default: { launcher: { warn: vi.fn(), info: vi.fn(), error: vi.fn() } },
}));

const env = {
  xplaneVersion: '12.4.4-b4',
  xplaneSteam: true,
  appVersion: '2.4.2',
  platform: 'darwin' as const,
};

const gatePayload = {
  aircraft: { path: 'Aircraft/X-Aviation/IXEG 737 Classic/B733.acf', livery: 'Lufthansa' },
  ramp_start: { airport_id: 'DAAG', ramp: 'Gate 12' },
  weather: 'use_real_weather',
  use_system_time: true,
  engine_status: { all_engines: { running: false } },
} as unknown as FlightInit;

describe('summarizeFlightInit', () => {
  it('keeps the request shape and drops nothing that identifies the machine', () => {
    expect(summarizeFlightInit(gatePayload)).toEqual({
      aircraft_path: 'Aircraft/X-Aviation/IXEG 737 Classic/B733.acf',
      livery: 'Lufthansa',
      start_key: 'ramp_start',
      start_type: 'ramp',
      airport_id: 'DAAG',
      position: 'Gate 12',
      weather: 'use_real_weather',
      time_mode: 'system',
      engines_running: false,
    });
  });

  it('classifies a coordinate start as custom with no airport', () => {
    const payload = {
      aircraft: { path: 'Aircraft/A/B.acf' },
      lle_ground_start: { latitude: 32.9, longitude: 2.4, heading_true: 0 },
      weather: { visibility: 10 },
      local_time: { day_of_year: 1, seconds_since_midnight: 0 },
    } as unknown as FlightInit;
    const summary = summarizeFlightInit(payload);
    expect(summary.start_key).toBe('lle_ground_start');
    expect(summary.start_type).toBe('custom');
    expect(summary.airport_id).toBeNull();
    expect(summary.weather).toBe('custom');
    expect(summary.time_mode).toBe('local');
  });
});

describe('reportFlightRejection', () => {
  const analytics = { track: vi.fn() };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('files one Sentry issue per X-Plane error code with the request attached', () => {
    reportFlightRejection(
      analytics,
      gatePayload,
      {
        code: 'missing_ramp',
        message: "Failed to parse ramp start, ramp 'Gate 12' is not recognized",
      },
      env
    );

    expect(sentry.scope.setFingerprint).toHaveBeenCalledWith([
      'xplane-flight-rejected',
      'missing_ramp',
    ]);
    expect(sentry.scope.setTag).toHaveBeenCalledWith('xplane_error_code', 'missing_ramp');
    expect(sentry.scope.setContext).toHaveBeenCalledWith(
      'flight_rejection',
      expect.objectContaining({
        error_code: 'missing_ramp',
        error_message: "Failed to parse ramp start, ramp 'Gate 12' is not recognized",
        airport_id: 'DAAG',
        position: 'Gate 12',
        xplane_version: '12.4.4-b4',
        xplane_steam: true,
        platform: 'darwin',
      })
    );
    expect(sentry.captureMessage).toHaveBeenCalledWith(
      'X-Plane rejected the flight: missing_ramp',
      'error'
    );
  });

  it('tracks the rejection with the code, airport and start type', () => {
    reportFlightRejection(analytics, gatePayload, { code: 'missing_aircraft', message: 'x' }, env);
    expect(analytics.track).toHaveBeenCalledWith('flight_rejected', {
      error_code: 'missing_aircraft',
      airport: 'DAAG',
      start_type: 'ramp',
    });
  });

  it('buckets codes it does not know as other and truncates long messages', () => {
    reportFlightRejection(
      analytics,
      gatePayload,
      { code: 'something_new', message: 'y'.repeat(2000) },
      env
    );
    expect(sentry.scope.setFingerprint).toHaveBeenCalledWith(['xplane-flight-rejected', 'other']);
    const context = sentry.scope.setContext.mock.calls[0]![1] as { error_message: string };
    expect(context.error_message).toHaveLength(500);
    expect(analytics.track).toHaveBeenCalledWith(
      'flight_rejected',
      expect.objectContaining({ error_code: 'other' })
    );
  });
});
