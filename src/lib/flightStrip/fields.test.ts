import { describe, expect, it } from 'vitest';
import {
  DEFAULT_FLIGHT_STRIP_FIELDS,
  DEFAULT_FLIGHT_STRIP_ORDER,
  parseFlightStripFields,
  parseFlightStripOrder,
  withFieldVisible,
} from './fields';

describe('withFieldVisible', () => {
  it('hides and shows a field', () => {
    const hidden = withFieldVisible(DEFAULT_FLIGHT_STRIP_FIELDS, 'wind', false);
    expect(hidden.wind).toBe(false);
    expect(withFieldVisible(hidden, 'wind', true).wind).toBe(true);
  });

  it('keeps the last readout on', () => {
    let fields = DEFAULT_FLIGHT_STRIP_FIELDS;
    for (const field of ['attitude', 'speed', 'altitude', 'verticalSpeed', 'heading'] as const) {
      fields = withFieldVisible(fields, field, false);
    }
    expect(withFieldVisible(fields, 'wind', false)).toBe(fields);
    expect(fields.wind).toBe(true);
  });

  it('lets the aircraft, targets and details lines go even with one readout left', () => {
    let fields = DEFAULT_FLIGHT_STRIP_FIELDS;
    for (const field of ['attitude', 'speed', 'altitude', 'verticalSpeed', 'heading'] as const) {
      fields = withFieldVisible(fields, field, false);
    }
    fields = withFieldVisible(fields, 'aircraft', false);
    fields = withFieldVisible(fields, 'targets', false);
    fields = withFieldVisible(fields, 'details', false);
    expect(fields).toMatchObject({ aircraft: false, targets: false, details: false, wind: true });
  });
});

describe('parseFlightStripOrder', () => {
  it('keeps a stored order and appends the readouts it lacks', () => {
    expect(parseFlightStripOrder(['wind', 'speed'])).toEqual([
      'wind',
      'speed',
      'attitude',
      'altitude',
      'verticalSpeed',
      'heading',
      'com1',
      'qnh',
    ]);
  });

  it('drops strangers and duplicates', () => {
    expect(parseFlightStripOrder(['qnh', 'bogus', 'qnh', 7])).toEqual([
      'qnh',
      ...DEFAULT_FLIGHT_STRIP_ORDER.filter((readout) => readout !== 'qnh'),
    ]);
  });

  it('falls back to the default order when nothing is readable', () => {
    expect(parseFlightStripOrder(undefined)).toEqual([...DEFAULT_FLIGHT_STRIP_ORDER]);
  });
});

describe('parseFlightStripFields', () => {
  it('keeps known booleans and fills the rest from the defaults', () => {
    expect(parseFlightStripFields({ wind: false, bogus: false, speed: 'no' })).toEqual({
      ...DEFAULT_FLIGHT_STRIP_FIELDS,
      wind: false,
    });
  });

  it('falls back to every field when nothing is readable', () => {
    expect(parseFlightStripFields(null)).toEqual(DEFAULT_FLIGHT_STRIP_FIELDS);
  });

  it('turns every readout back on when a stored set has none', () => {
    const none = {
      attitude: false,
      speed: false,
      altitude: false,
      verticalSpeed: false,
      heading: false,
      wind: false,
    };
    expect(parseFlightStripFields(none)).toEqual(DEFAULT_FLIGHT_STRIP_FIELDS);
  });
});
