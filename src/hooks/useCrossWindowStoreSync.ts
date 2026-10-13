import { useEffect } from 'react';
import { useSettingsStore } from '@/stores/settingsStore';
import { useTaxiGuidanceStore } from '@/stores/taxiGuidanceStore';

const SYNCED_STORES = [useSettingsStore, useTaxiGuidanceStore];

/**
 * A second window (the detached flight strip) reads persisted stores once at load. The
 * browser fires `storage` in every other window of the app when the main window
 * saves one, so this window reloads its copy and follows units, strip fields and the
 * planned taxi routes live.
 */
export function useCrossWindowStoreSync(): void {
  useEffect(() => {
    const onStorage = (event: StorageEvent) => {
      for (const store of SYNCED_STORES) {
        if (event.key === store.persist.getOptions().name) void store.persist.rehydrate();
      }
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);
}
