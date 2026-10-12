/**
 * What the flight strip shows. One set drives the map strip and the detached
 * window alike; at least one readout always stays on so the strip is never empty.
 */
export const FLIGHT_STRIP_READOUTS = [
  'attitude',
  'speed',
  'altitude',
  'verticalSpeed',
  'heading',
  'wind',
] as const;
export type FlightStripReadout = (typeof FLIGHT_STRIP_READOUTS)[number];

/** Readouts plus the aircraft identity, the autopilot target bugs and the small line under each value. */
export const FLIGHT_STRIP_FIELDS = [
  'aircraft',
  ...FLIGHT_STRIP_READOUTS,
  'targets',
  'details',
] as const;
export type FlightStripField = (typeof FLIGHT_STRIP_FIELDS)[number];

export type FlightStripFields = Record<FlightStripField, boolean>;

export const DEFAULT_FLIGHT_STRIP_FIELDS: FlightStripFields = {
  aircraft: true,
  attitude: true,
  speed: true,
  altitude: true,
  verticalSpeed: true,
  heading: true,
  wind: true,
  targets: true,
  details: true,
};

function hasReadout(fields: FlightStripFields): boolean {
  return FLIGHT_STRIP_READOUTS.some((field) => fields[field]);
}

/** The fields with one shown or hidden; the same object back when that would hide the last readout. */
export function withFieldVisible(
  fields: FlightStripFields,
  field: FlightStripField,
  visible: boolean
): FlightStripFields {
  const next = { ...fields, [field]: visible };
  return hasReadout(next) ? next : fields;
}

/** Stored input is untrusted: keep known booleans, default the rest, never leave the strip empty. */
export function parseFlightStripFields(input: unknown): FlightStripFields {
  const source =
    typeof input === 'object' && input !== null ? (input as Record<string, unknown>) : {};
  const out = { ...DEFAULT_FLIGHT_STRIP_FIELDS };
  for (const field of FLIGHT_STRIP_FIELDS) {
    const value = source[field];
    if (typeof value === 'boolean') out[field] = value;
  }
  return hasReadout(out) ? out : { ...DEFAULT_FLIGHT_STRIP_FIELDS };
}
