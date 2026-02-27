/**
 * SimBrief API Types
 * Types for the SimBrief OFP (Operational Flight Plan) API response
 */

export interface SimBriefAirport {
  icao_code: string;
  iata_code: string;
  name: string;
  pos_lat: string;
  pos_long: string;
  elevation: string;
  plan_rwy: string;
  metar: string;
  taf: string;
}

export interface SimBriefFix {
  ident: string;
  name: string;
  type: string;
  pos_lat: string;
  pos_long: string;
  via_airway: string;
  is_sid_star: string;
  stage: string;
  altitude_feet: string;
  ind_airspeed: string;
  wind_dir: string;
  wind_spd: string;
  oat: string;
  leg_time: string;
  fuel_leg: string;
  fuel_totalused: string;
  fuel_remaining: string;
  distance_to_go: string;
  fir: string;
}

export interface SimBriefFuel {
  taxi: string;
  enroute_burn: string;
  contingency: string;
  alternate_burn: string;
  reserve: string;
  extra: string;
  plan_takeoff: string;
  plan_ramp: string;
  plan_landing: string;
}

export interface SimBriefWeights {
  oew: string;
  pax_count: string;
  cargo: string;
  payload: string;
  est_zfw: string;
  est_tow: string;
  est_ldw: string;
  max_zfw: string;
  max_tow: string;
  max_ldw: string;
}

export interface SimBriefTimes {
  est_time_enroute: string;
  est_block: string;
  sched_out: string;
  sched_in: string;
}

export interface SimBriefGeneral {
  icao_airline: string;
  flight_number: string;
  route: string;
  initial_altitude: string;
  avg_wind_dir: string;
  avg_wind_spd: string;
  gc_distance: string;
  air_distance: string;
  total_burn: string;
  costindex: string;
  airac: string;
}

export interface SimBriefAircraft {
  icao_code: string;
  name: string;
  reg: string;
}

export interface SimBriefOFP {
  fetch: {
    userid: string;
    status: string;
    time: string;
  };
  params: {
    units: string;
  };
  general: SimBriefGeneral;
  origin: SimBriefAirport;
  destination: SimBriefAirport;
  alternate?: SimBriefAirport;
  navlog: {
    fix: SimBriefFix[];
  };
  fuel: SimBriefFuel;
  weights: SimBriefWeights;
  times: SimBriefTimes;
  aircraft: SimBriefAircraft;
  atc: {
    callsign: string;
    route: string;
  };
  files: {
    pdf: { link: string };
  };
}

/** IPC response type for SimBrief fetch */
export type SimBriefFetchResult =
  | { success: true; data: SimBriefOFP }
  | { success: false; error: string };
