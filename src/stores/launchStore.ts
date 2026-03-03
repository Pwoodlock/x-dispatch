import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import {
  type CloudLayer,
  type CustomWeatherState,
  DEFAULT_CLOUD_LAYER,
  type WeatherConfig,
  createDefaultWeatherConfig,
  getPresetDefaults,
} from '@/components/dialogs/LaunchDialog/weatherTypes';
import type { Aircraft } from '@/types/aircraft';

interface LaunchState {
  // Selection
  selectedAircraft: Aircraft | null;
  selectedLivery: string;

  // Flight Config
  tankPercentages: number[];
  payloadWeights: number[];
  timeOfDay: number;
  useRealWorldTime: boolean;
  coldAndDark: boolean;
  weatherConfig: WeatherConfig;

  // Favorites (persisted to localStorage)
  favorites: string[];

  // UI State
  isLaunching: boolean;
  launchError: string | null;

  // Actions
  selectAircraft: (aircraft: Aircraft | null) => void;
  setSelectedLivery: (livery: string) => void;
  setTankPercentage: (index: number, value: number) => void;
  setAllTanksPercentage: (value: number) => void;
  setPayloadWeight: (index: number, value: number) => void;
  setTimeOfDay: (value: number) => void;
  setUseRealWorldTime: (value: boolean) => void;
  setColdAndDark: (value: boolean) => void;
  setWeatherMode: (mode: WeatherConfig['mode']) => void;
  setWeatherPreset: (preset: string) => void;
  updateCustomWeather: (partial: Partial<CustomWeatherState>) => void;
  addCloudLayer: () => void;
  removeCloudLayer: (index: number) => void;
  updateCloudLayer: (index: number, data: Partial<CloudLayer>) => void;
  toggleFavorite: (path: string) => void;
  setIsLaunching: (value: boolean) => void;
  setLaunchError: (error: string | null) => void;
  resetConfig: () => void;
}

const DEFAULT_CONFIG = {
  selectedAircraft: null,
  selectedLivery: 'Default',
  tankPercentages: [] as number[],
  payloadWeights: [] as number[],
  timeOfDay: 12,
  useRealWorldTime: false,
  coldAndDark: false,
  weatherConfig: createDefaultWeatherConfig(),
  isLaunching: false,
  launchError: null,
};

export const useLaunchStore = create<LaunchState>()(
  persist(
    (set) => ({
      ...DEFAULT_CONFIG,
      favorites: [],

      selectAircraft: (aircraft) =>
        set({
          selectedAircraft: aircraft,
          selectedLivery: 'Default',
          tankPercentages: aircraft ? new Array((aircraft.tankNames ?? []).length).fill(50) : [],
          payloadWeights: aircraft
            ? new Array((aircraft.payloadStations ?? []).length).fill(0)
            : [],
          launchError: null,
        }),

      setSelectedLivery: (livery) => set({ selectedLivery: livery }),

      setTankPercentage: (index, value) =>
        set((state) => {
          const tankPercentages = [...state.tankPercentages];
          tankPercentages[index] = value;
          return { tankPercentages };
        }),

      setAllTanksPercentage: (value) =>
        set((state) => ({
          tankPercentages: state.tankPercentages.map(() => value),
        })),

      setPayloadWeight: (index, value) =>
        set((state) => {
          const payloadWeights = [...state.payloadWeights];
          payloadWeights[index] = value;
          return { payloadWeights };
        }),

      setTimeOfDay: (value) => set({ timeOfDay: value }),

      setUseRealWorldTime: (value) => set({ useRealWorldTime: value }),

      setColdAndDark: (value) => set({ coldAndDark: value }),

      setWeatherMode: (mode) =>
        set((state) => ({
          weatherConfig: { ...state.weatherConfig, mode },
        })),

      setWeatherPreset: (preset) => {
        const defaults = getPresetDefaults(preset);
        set({
          weatherConfig: {
            mode: preset === 'real' ? 'real' : 'preset',
            preset,
            custom: { ...defaults, clouds: defaults.clouds.map((c) => ({ ...c })) },
          },
        });
      },

      updateCustomWeather: (partial) =>
        set((state) => ({
          weatherConfig: {
            ...state.weatherConfig,
            mode: 'custom',
            custom: { ...state.weatherConfig.custom, ...partial },
          },
        })),

      addCloudLayer: () =>
        set((state) => {
          if (state.weatherConfig.custom.clouds.length >= 3) return state;
          return {
            weatherConfig: {
              ...state.weatherConfig,
              mode: 'custom',
              custom: {
                ...state.weatherConfig.custom,
                clouds: [...state.weatherConfig.custom.clouds, { ...DEFAULT_CLOUD_LAYER }],
              },
            },
          };
        }),

      removeCloudLayer: (index) =>
        set((state) => ({
          weatherConfig: {
            ...state.weatherConfig,
            mode: 'custom',
            custom: {
              ...state.weatherConfig.custom,
              clouds: state.weatherConfig.custom.clouds.filter((_, i) => i !== index),
            },
          },
        })),

      updateCloudLayer: (index, data) =>
        set((state) => {
          const clouds = state.weatherConfig.custom.clouds.map((c, i) =>
            i === index ? { ...c, ...data } : c
          );
          return {
            weatherConfig: {
              ...state.weatherConfig,
              mode: 'custom',
              custom: { ...state.weatherConfig.custom, clouds },
            },
          };
        }),

      toggleFavorite: (path) =>
        set((state) => ({
          favorites: state.favorites.includes(path)
            ? state.favorites.filter((p) => p !== path)
            : [...state.favorites, path],
        })),

      setIsLaunching: (value) => set({ isLaunching: value }),

      setLaunchError: (error) => set({ launchError: error }),

      resetConfig: () => set(DEFAULT_CONFIG),
    }),
    {
      name: 'launch-store',
      partialize: (state) => ({
        favorites: state.favorites,
        selectedAircraft: state.selectedAircraft,
        selectedLivery: state.selectedLivery,
        tankPercentages: state.tankPercentages,
        payloadWeights: state.payloadWeights,
        timeOfDay: state.timeOfDay,
        useRealWorldTime: state.useRealWorldTime,
        coldAndDark: state.coldAndDark,
        weatherConfig: state.weatherConfig,
      }),
      migrate: (persisted: unknown, version: number) => {
        const state = persisted as Record<string, unknown>;

        // v0 → v1: fuelPercentage → tankPercentages
        if (version < 1) {
          if ('fuelPercentage' in state && !('tankPercentages' in state)) {
            const pct = (state.fuelPercentage as number) ?? 50;
            const aircraft = state.selectedAircraft as Aircraft | null;
            const tankCount = aircraft?.tankNames.length || 0;
            state.tankPercentages = new Array(tankCount).fill(pct);
            state.payloadWeights = new Array(aircraft?.payloadStations?.length || 0).fill(0);
            delete state.fuelPercentage;
          }
        }

        // v1 → v2: selectedWeather → weatherConfig
        if (version < 2) {
          if ('selectedWeather' in state && !('weatherConfig' in state)) {
            const weather = (state.selectedWeather as string) || 'clear';
            const defaults = getPresetDefaults(weather);
            state.weatherConfig = {
              mode: weather === 'real' ? 'real' : 'preset',
              preset: weather,
              custom: { ...defaults, clouds: defaults.clouds.map((c) => ({ ...c })) },
            } satisfies WeatherConfig;
            delete state.selectedWeather;
          }
        }

        return state as unknown as LaunchState;
      },
      version: 2,
    }
  )
);
