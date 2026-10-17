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
  'com1',
  'qnh',
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
  // Radio and altimeter are for pilots who want them: the strip is full as it is.
  com1: false,
  qnh: false,
  targets: true,
  details: true,
};

/** Left to right on the strip. */
export const DEFAULT_FLIGHT_STRIP_ORDER: readonly FlightStripReadout[] = FLIGHT_STRIP_READOUTS;

function isReadout(value: unknown): value is FlightStripReadout {
  return (FLIGHT_STRIP_READOUTS as readonly unknown[]).includes(value);
}

/**
 * Stored input is untrusted and may predate a readout: known readouts keep their
 * order, duplicates and strangers go, and readouts it lacks follow at the end.
 */
export function parseFlightStripOrder(input: unknown): FlightStripReadout[] {
  const seen = new Set<FlightStripReadout>();
  const order: FlightStripReadout[] = [];
  for (const value of Array.isArray(input) ? input : []) {
    if (isReadout(value) && !seen.has(value)) {
      seen.add(value);
      order.push(value);
    }
  }
  for (const readout of DEFAULT_FLIGHT_STRIP_ORDER) {
    if (!seen.has(readout)) order.push(readout);
  }
  return order;
}

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
