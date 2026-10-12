import { useEffect } from 'react';
import { useSettingsStore } from '@/stores/settingsStore';

/**
 * A second window (the detached flight strip) reads the settings once at load. The
 * browser fires `storage` in every other window of the app when the main window
 * saves them, so this window reloads its copy and follows units and strip fields live.
 */
export function useSettingsStorageSync(): void {
  useEffect(() => {
    const { name } = useSettingsStore.persist.getOptions();
    const onStorage = (event: StorageEvent) => {
      if (event.key === name) void useSettingsStore.persist.rehydrate();
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);
}
