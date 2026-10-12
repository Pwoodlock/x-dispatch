import type { PlaneState } from '@/types/xplane';

/**
 * Made-up readings for the Flight Strip preview: an A320 in a gentle climbing turn,
 * so every readout and autopilot bug has something to show while X-Plane is not
 * running. Only the strip reads this; the plane store, the map aircraft and the
 * flight recorder never see it.
 */
export const SAMPLE_PLANE_STATE: PlaneState = {
  latitude: 48.7262,
  longitude: 2.3652,
  altitudeMSL: 12450,
  altitudeAGL: 12050,
  heading: 274,
  pitch: 4.5,
  roll: -12,
  groundspeed: 318,
  indicatedAirspeed: 268,
  trueAirspeed: 324,
  verticalSpeed: 1800,
  mach: 0.52,
  windDirection: 250,
  windSpeed: 24,
  oat: -9,
  throttle: 0.85,
  flaps: 0,
  gearDown: false,
  parkingBrake: 0,
  speedBrake: 0,
  gForceNormal: 1,
  gForceAxial: 0,
  gForceSide: 0,
  apAltitude: 15000,
  apHeading: 280,
  apAirspeed: 270,
  apAirspeedIsMach: false,
  apVerticalSpeed: 1800,
  nav1Course: 265,
  nav1Frequency: 11030,
  aircraftCategory: 'airliner',
  onGround: false,
  icaoType: 'A320',
  aircraftName: 'Airbus A320',
  tailNumber: 'F-HXDP',
};
