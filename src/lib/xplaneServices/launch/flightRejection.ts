import * as Sentry from '@sentry/electron/main';
import logger from '@/lib/utils/logger';
import type { FlightInit } from '@/lib/xplaneServices/client/generated/xplaneApi';

/** Error codes X-Plane's flight initializer returns, per the Flight Initialization API. */
export const XPLANE_FLIGHT_ERROR_CODES = [
  'json_invalid',
  'missing_aircraft',
  'missing_livery',
  'missing_airport',
  'missing_ramp',
  'missing_runway',
] as const;

export interface FlightRejection {
  /** X-Plane's `error_code`. */
  code: string;
  /** X-Plane's `error_message`. */
  message: string;
}

export interface FlightRejectionEnvironment {
  xplaneVersion: string | null;
  xplaneSteam: boolean;
  appVersion: string;
  platform: NodeJS.Platform;
}

interface RejectionAnalytics {
  track: (event: 'flight_rejected', properties: Record<string, unknown>) => void;
}

const MESSAGE_MAX_CHARS = 500;

type StartType = 'runway' | 'ramp' | 'custom';

interface FlightInitSummary {
  aircraft_path: string | null;
  livery: string | null;
  start_key: string;
  start_type: StartType;
  airport_id: string | null;
  position: string | null;
  weather: string | null;
  time_mode: string | null;
  engines_running: boolean | null;
}

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' ? (value as Record<string, unknown>) : null;
}

function text(value: unknown): string | null {
  return typeof value === 'string' ? value : null;
}

/**
 * What the report carries about the payload: enough to reproduce the shape of
 * the request, never the user's machine. Aircraft paths are relative to the
 * X-Plane folder by construction.
 */
export function summarizeFlightInit(payload: FlightInit): FlightInitSummary {
  const p = payload as unknown as Record<string, unknown>;
  const aircraft = record(p.aircraft);
  const runway = record(p.runway_start);
  const ramp = record(p.ramp_start);

  let start: Pick<FlightInitSummary, 'start_key' | 'start_type' | 'airport_id' | 'position'>;
  if (runway) {
    start = {
      start_key: 'runway_start',
      start_type: 'runway',
      airport_id: text(runway.airport_id),
      position: text(runway.runway),
    };
  } else if (ramp) {
    start = {
      start_key: 'ramp_start',
      start_type: 'ramp',
      airport_id: text(ramp.airport_id),
      position: text(ramp.ramp),
    };
  } else {
    const key =
      ['lle_ground_start', 'lle_air_start', 'boat_start'].find((k) => record(p[k])) ?? 'none';
    start = { start_key: key, start_type: 'custom', airport_id: null, position: null };
  }

  const weather = typeof p.weather === 'string' ? p.weather : p.weather ? 'custom' : null;
  const time_mode = p.use_system_time
    ? 'system'
    : p.local_time
      ? 'local'
      : p.gmt_time
        ? 'gmt'
        : p.time_enum
          ? 'preset'
          : null;
  const running = record(record(p.engine_status)?.all_engines)?.running;

  return {
    aircraft_path: text(aircraft?.path),
    livery: text(aircraft?.livery),
    ...start,
    weather,
    time_mode,
    engines_running: typeof running === 'boolean' ? running : null,
  };
}

/**
 * X-Plane refused a flight we validated. One Sentry issue per X-Plane error
 * code, with the request shape and the sim version attached, plus a PostHog
 * event so the rejection rate sits next to the launch rate. Both sinks are
 * no-ops when the user declined crash reports or analytics.
 */
export function reportFlightRejection(
  analytics: RejectionAnalytics,
  payload: FlightInit,
  rejection: FlightRejection,
  env: FlightRejectionEnvironment
): void {
  const summary = summarizeFlightInit(payload);
  const known = (XPLANE_FLIGHT_ERROR_CODES as readonly string[]).includes(rejection.code);
  const code = known ? rejection.code : 'other';
  const message = rejection.message.slice(0, MESSAGE_MAX_CHARS);

  logger.launcher.warn(`X-Plane rejected the flight (${rejection.code}): ${message}`);

  Sentry.withScope((scope) => {
    scope.setFingerprint(['xplane-flight-rejected', code]);
    scope.setTag('xplane_error_code', code);
    scope.setContext('flight_rejection', {
      ...summary,
      error_code: rejection.code,
      error_message: message,
      xplane_version: env.xplaneVersion,
      xplane_steam: env.xplaneSteam,
      app_version: env.appVersion,
      platform: env.platform,
    });
    Sentry.captureMessage(`X-Plane rejected the flight: ${code}`, 'error');
  });

  analytics.track('flight_rejected', {
    error_code: code,
    airport: summary.airport_id,
    start_type: summary.start_type,
  });
}
