import { useEffect } from 'react';
import type { DraftSnapshot, MapPlanSnapshot } from '@/lib/flightplan/sharedPlan';
import { type SharedPlanSide, createSharedPlanSync } from '@/lib/flightplan/sharedPlanSync';
import { uuid } from '@/lib/utils/uuid';
import { useFlightPlanStore } from '@/stores/flightPlanStore';
import { usePlanBuilderStore } from '@/stores/planBuilderStore';

const mapSide: SharedPlanSide<MapPlanSnapshot> = {
  read: () => {
    const s = useFlightPlanStore.getState();
    return {
      departure: s.departure,
      arrival: s.arrival,
      route: s.route,
      cruiseAltitude: s.cruiseAltitude,
      fmsData: s.fmsData,
      fileName: s.fileName,
      simbriefData: s.simbriefData,
      showFlightPlanBar: s.showFlightPlanBar,
    };
  },
  apply: (plan) =>
    useFlightPlanStore.setState({ ...plan, isEnriching: false, selectedWaypointIndex: null }),
  subscribe: (listener) => useFlightPlanStore.subscribe(listener),
};

const draftSide: SharedPlanSide<DraftSnapshot> = {
  read: () => {
    const s = usePlanBuilderStore.getState();
    return {
      departure: s.departure,
      arrival: s.arrival,
      alternate: s.alternate ?? null,
      aircraftClass: s.aircraftClass,
      routeText: s.routeText,
      cruiseAltitudeFt: s.cruiseAltitudeFt,
    };
  },
  // The open planner resolves the new draft on its own, as after an undo.
  apply: (draft) => usePlanBuilderStore.getState().restoreDraft(draft),
  subscribe: (listener) => usePlanBuilderStore.subscribe(listener),
};

/**
 * The desktop window and every tablet show the same flight plan: the one on the
 * map and the planner's draft. Edits on any device reach the others through main.
 */
export function useSharedPlanSync(): void {
  useEffect(() => {
    const sync = createSharedPlanSync({
      origin: uuid(),
      map: mapSide,
      draft: draftSide,
      api: {
        get: () => window.flightPlanAPI.getShared(),
        set: (doc) => window.flightPlanAPI.setShared(doc),
        onChanged: (listener) => window.flightPlanAPI.onSharedChanged(listener),
      },
    });
    void sync.start();

    // A tablet that lost the link asks again: the desktop may have planned meanwhile.
    let offConnection = () => undefined as void;
    if (window.appAPI.isRemoteClient) {
      void import('@/lib/bridge/browser/installRemoteBridge').then(
        ({ onRemoteConnectionState }) => {
          let wasDown = false;
          offConnection = onRemoteConnectionState((state) => {
            if (state === 'connected' && wasDown) void sync.resync();
            wasDown = state !== 'connected';
          });
        }
      );
    }
    return () => {
      offConnection();
      sync.stop();
    };
  }, []);
}
