import { useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  DEFAULT_FLIGHT_STRIP_WINDOW_OPTIONS,
  type FlightStripWindowOptions,
} from '@/lib/flightStrip/windowOptions';

const flightStripKeys = {
  open: ['app', 'flightStripWindow', 'open'] as const,
  options: ['app', 'flightStripWindow', 'options'] as const,
};

/** Whether the detached strip window is open; main pushes every change. */
export function useFlightStripWindowOpen(): boolean {
  const queryClient = useQueryClient();
  useEffect(
    () =>
      window.appAPI.onFlightStripWindowOpen((open) =>
        queryClient.setQueryData<boolean>(flightStripKeys.open, open)
      ),
    [queryClient]
  );
  const { data } = useQuery<boolean>({
    queryKey: flightStripKeys.open,
    queryFn: () => window.appAPI.isFlightStripWindowOpen(),
    staleTime: Infinity,
    retry: false,
    refetchOnWindowFocus: false,
  });
  return data ?? false;
}

/** The options main applies to the strip window, as the strip window sees them. */
export function useFlightStripWindowOptions(): FlightStripWindowOptions {
  const queryClient = useQueryClient();
  useEffect(
    () =>
      window.appAPI.onFlightStripWindowOptions((options) =>
        queryClient.setQueryData<FlightStripWindowOptions>(flightStripKeys.options, options)
      ),
    [queryClient]
  );
  const { data } = useQuery<FlightStripWindowOptions>({
    queryKey: flightStripKeys.options,
    queryFn: () => window.appAPI.getFlightStripWindowOptions(),
    staleTime: Infinity,
    retry: false,
    refetchOnWindowFocus: false,
  });
  return data ?? DEFAULT_FLIGHT_STRIP_WINDOW_OPTIONS;
}
