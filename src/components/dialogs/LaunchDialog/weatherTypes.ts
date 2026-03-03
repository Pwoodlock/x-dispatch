// ─── Weather Configuration Types ─────────────────────────────────────────────

export interface WeatherConfig {
  mode: 'real' | 'preset' | 'custom';
  preset: string;
  custom: CustomWeatherState;
}

export interface CustomWeatherState {
  visibility_km: number;
  precipitation: number;
  temperature_offset_c: number;
  terrain_state: 'dry' | 'wet' | 'snowy' | 'icy';
  wind_speed_kts: number;
  wind_direction_deg: number;
  wind_gust_kts: number;
  clouds: CloudLayer[];
}

export interface CloudLayer {
  type: 'cirrus' | 'stratus' | 'cumulus' | 'cumulonimbus';
  cover: number;
  base_ft: number;
  tops_ft: number;
}

// ─── Visibility Stops (non-linear) ──────────────────────────────────────────

export const VISIBILITY_STOPS = [0.1, 0.25, 0.5, 1, 2, 3, 5, 8, 10, 15, 20, 30, 50] as const;

// ─── Terrain State Mapping ──────────────────────────────────────────────────
// Maps simplified UI states to X-Plane API terrain_state values

export const TERRAIN_STATE_MAP = {
  dry: 'dry',
  wet: 'medium_wet',
  snowy: 'medium_snowy',
  icy: 'medium_icy',
} as const;

// ─── Cloud Type Labels ──────────────────────────────────────────────────────

export const CLOUD_TYPE_LABELS: Record<CloudLayer['type'], string> = {
  cirrus: 'Cirrus',
  stratus: 'Stratus',
  cumulus: 'Cumulus',
  cumulonimbus: 'Cumulonimbus',
};

// ─── Default Cloud Layer ────────────────────────────────────────────────────

export const DEFAULT_CLOUD_LAYER: CloudLayer = {
  type: 'stratus',
  cover: 0.5,
  base_ft: 3000,
  tops_ft: 8000,
};

// ─── Preset Defaults ────────────────────────────────────────────────────────

export const PRESET_DEFAULTS: Record<string, CustomWeatherState> = {
  clear: {
    visibility_km: 50,
    precipitation: 0,
    temperature_offset_c: 0,
    terrain_state: 'dry',
    wind_speed_kts: 5,
    wind_direction_deg: 270,
    wind_gust_kts: 0,
    clouds: [],
  },
  cloudy: {
    visibility_km: 15,
    precipitation: 0,
    temperature_offset_c: 0,
    terrain_state: 'dry',
    wind_speed_kts: 12,
    wind_direction_deg: 250,
    wind_gust_kts: 0,
    clouds: [{ type: 'stratus', cover: 0.85, base_ft: 4000, tops_ft: 10000 }],
  },
  rainy: {
    visibility_km: 6,
    precipitation: 0.5,
    temperature_offset_c: 0,
    terrain_state: 'wet',
    wind_speed_kts: 18,
    wind_direction_deg: 200,
    wind_gust_kts: 8,
    clouds: [
      { type: 'cumulus', cover: 0.9, base_ft: 2000, tops_ft: 15000 },
      { type: 'stratus', cover: 0.4, base_ft: 18000, tops_ft: 25000 },
    ],
  },
  stormy: {
    visibility_km: 3,
    precipitation: 0.8,
    temperature_offset_c: 0,
    terrain_state: 'wet',
    wind_speed_kts: 28,
    wind_direction_deg: 180,
    wind_gust_kts: 18,
    clouds: [
      { type: 'cumulonimbus', cover: 0.95, base_ft: 1500, tops_ft: 40000 },
      { type: 'cumulus', cover: 0.6, base_ft: 20000, tops_ft: 30000 },
    ],
  },
  snowy: {
    visibility_km: 4,
    precipitation: 0.4,
    temperature_offset_c: -15,
    terrain_state: 'snowy',
    wind_speed_kts: 15,
    wind_direction_deg: 320,
    wind_gust_kts: 5,
    clouds: [{ type: 'stratus', cover: 0.95, base_ft: 2500, tops_ft: 12000 }],
  },
  foggy: {
    visibility_km: 0.4,
    precipitation: 0,
    temperature_offset_c: 0,
    terrain_state: 'dry',
    wind_speed_kts: 3,
    wind_direction_deg: 270,
    wind_gust_kts: 0,
    clouds: [{ type: 'stratus', cover: 1, base_ft: 0, tops_ft: 800 }],
  },
};

// ─── Preset Definition Strings (for X-Plane API preset mode) ────────────────

export const PRESET_DEFINITION_STRINGS = {
  clear: 'vfr_few_clouds',
  cloudy: 'vfr_broken',
  rainy: 'ifr_non_precision',
  stormy: 'large_cell_thunderstorm',
  snowy: 'ifr_precision',
  foggy: 'ifr_precision',
} as const;

// ─── Helpers ────────────────────────────────────────────────────────────────

export function getPresetDefaults(preset: string): CustomWeatherState {
  return PRESET_DEFAULTS[preset] ?? PRESET_DEFAULTS.clear;
}

export function createDefaultWeatherConfig(): WeatherConfig {
  return {
    mode: 'preset',
    preset: 'clear',
    custom: { ...PRESET_DEFAULTS.clear, clouds: [] },
  };
}

/** Find the closest visibility stop index for a given value */
export function findClosestVisibilityIndex(km: number): number {
  let closest = 0;
  let minDiff = Math.abs(VISIBILITY_STOPS[0] - km);
  for (let i = 1; i < VISIBILITY_STOPS.length; i++) {
    const diff = Math.abs(VISIBILITY_STOPS[i] - km);
    if (diff < minDiff) {
      minDiff = diff;
      closest = i;
    }
  }
  return closest;
}

/** Format visibility for display */
export function formatVisibility(km: number): string {
  if (km < 1) return `${Math.round(km * 1000)} m`;
  return `${km} km`;
}

/** Format wind for display */
export function formatWind(direction: number, speed: number, gusts: number): string {
  const dir = String(Math.round(direction)).padStart(3, '0');
  if (speed === 0) return 'Calm';
  if (gusts > 0) return `${dir}° @ ${speed} G${speed + gusts} kts`;
  return `${dir}° @ ${speed} kts`;
}

/** Get a short summary string for the weather config */
export function getWeatherSummary(config: WeatherConfig): string {
  if (config.mode === 'real') return 'Real Weather';
  const c = config.custom;
  const vis = formatVisibility(c.visibility_km);
  const wind = c.wind_speed_kts === 0 ? 'Calm' : `${c.wind_speed_kts} kts`;
  return `${vis} · ${wind}`;
}
