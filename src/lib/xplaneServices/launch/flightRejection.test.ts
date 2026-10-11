import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { FlightInit } from '@/lib/xplaneServices/client/generated/xplaneApi';
import { reportFlightRejection, startOf } from './flightRejection';

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
  weight: { fueltank_weight_in_kilograms: [2268, 3506, 2268, 0, 0, 0, 0, 0, 0] },
} as unknown as FlightInit;

describe('startOf', () => {
  it('reads the airport and start type from a ramp start', () => {
    expect(startOf(gatePayload)).toEqual({ airport: 'DAAG', start_type: 'ramp' });
  });

  it('classifies a coordinate start as custom with no airport', () => {
    const payload = {
      aircraft: { path: 'Aircraft/A/B.acf' },
      lle_ground_start: { latitude: 32.9, longitude: 2.4, heading_true: 0 },
    } as unknown as FlightInit;
    expect(startOf(payload)).toEqual({ airport: null, start_type: 'custom' });
  });
});

describe('reportFlightRejection', () => {
  const analytics = { track: vi.fn() };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('files one Sentry issue per X-Plane error code with the exact payload attached', () => {
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
    expect(sentry.scope.setContext).toHaveBeenCalledWith('flight_rejection', {
      error_code: 'missing_ramp',
      error_message: "Failed to parse ramp start, ramp 'Gate 12' is not recognized",
      payload: gatePayload,
      xplane_version: '12.4.4-b4',
      xplane_steam: true,
      app_version: '2.4.2',
      platform: 'darwin',
    });
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
