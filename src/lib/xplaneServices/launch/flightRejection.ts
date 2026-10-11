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

/** The two facts analytics keeps about a refused payload. */
export function startOf(payload: FlightInit): {
  airport: string | null;
  start_type: 'runway' | 'ramp' | 'custom';
} {
  if (payload.runway_start) {
    return { airport: payload.runway_start.airport_id ?? null, start_type: 'runway' };
  }
  if (payload.ramp_start) {
    return { airport: payload.ramp_start.airport_id ?? null, start_type: 'ramp' };
  }
  return { airport: null, start_type: 'custom' };
}

/**
 * X-Plane refused a flight we validated. One Sentry issue per X-Plane error
 * code, with the exact payload and the sim version attached, plus a PostHog
 * event so the rejection rate sits next to the launch rate. The payload holds
 * no machine-identifying data: aircraft paths are relative to the X-Plane
 * folder by construction. Both sinks are no-ops when the user declined crash
 * reports or analytics.
 */
export function reportFlightRejection(
  analytics: RejectionAnalytics,
  payload: FlightInit,
  rejection: FlightRejection,
  env: FlightRejectionEnvironment
): void {
  const known = (XPLANE_FLIGHT_ERROR_CODES as readonly string[]).includes(rejection.code);
  const code = known ? rejection.code : 'other';
  const message = rejection.message.slice(0, MESSAGE_MAX_CHARS);

  logger.launcher.warn(`X-Plane rejected the flight (${rejection.code}): ${message}`);

  Sentry.withScope((scope) => {
    scope.setFingerprint(['xplane-flight-rejected', code]);
    scope.setTag('xplane_error_code', code);
    scope.setContext('flight_rejection', {
      error_code: rejection.code,
      error_message: message,
      payload,
      xplane_version: env.xplaneVersion,
      xplane_steam: env.xplaneSteam,
      app_version: env.appVersion,
      platform: env.platform,
    });
    Sentry.captureMessage(`X-Plane rejected the flight: ${code}`, 'error');
  });

  analytics.track('flight_rejected', { error_code: code, ...startOf(payload) });
}
