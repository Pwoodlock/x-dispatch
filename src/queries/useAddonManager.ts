// src/queries/useAddonManager.ts
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { SceneryEntry, SceneryError } from '@/lib/addonManager/core/types';
import { getSceneryErrorMessage } from '@/lib/addonManager/core/types';

// Query keys
export const addonKeys = {
  all: ['addon'] as const,
  scenery: ['addon', 'scenery'] as const,
  sceneryList: ['addon', 'scenery', 'list'] as const,
  sceneryBackups: ['addon', 'scenery', 'backups'] as const,
};

/**
 * Fetch and classify all scenery entries.
 */
export function useSceneryList(enabled = true) {
  return useQuery({
    queryKey: addonKeys.sceneryList,
    queryFn: async (): Promise<SceneryEntry[]> => {
      const result = await window.addonManagerAPI.scenery.analyze();
      if (!result.ok) {
        throw new Error(getSceneryErrorMessage(result.error as SceneryError));
      }
      return result.value;
    },
    enabled,
    staleTime: 30_000, // 30 seconds
  });
}

/**
 * Auto-sort scenery entries by priority.
 */
export function useScenerySort() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async () => {
      const result = await window.addonManagerAPI.scenery.sort();
      if (!result.ok) {
        throw new Error(getSceneryErrorMessage(result.error as SceneryError));
      }
      return result.value;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: addonKeys.sceneryList });
    },
  });
}

/**
 * Save custom scenery order.
 */
export function useScenarySaveOrder() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (folderNames: string[]) => {
      const result = await window.addonManagerAPI.scenery.saveOrder(folderNames);
      if (!result.ok) {
        throw new Error(getSceneryErrorMessage(result.error as SceneryError));
      }
      return result.value;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: addonKeys.sceneryList });
    },
  });
}

/**
 * Toggle scenery entry enabled/disabled.
 */
export function useSceneryToggle() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (folderName: string) => {
      const result = await window.addonManagerAPI.scenery.toggle(folderName);
      if (!result.ok) {
        throw new Error(getSceneryErrorMessage(result.error as SceneryError));
      }
      return result.value;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: addonKeys.sceneryList });
    },
  });
}

/**
 * Move scenery entry up or down within its tier.
 */
export function useSceneryMove() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      folderName,
      direction,
    }: {
      folderName: string;
      direction: 'up' | 'down';
    }) => {
      const result = await window.addonManagerAPI.scenery.move(folderName, direction);
      if (!result.ok) {
        throw new Error(getSceneryErrorMessage(result.error as SceneryError));
      }
      return result.value;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: addonKeys.sceneryList });
    },
  });
}

/**
 * Create manual backup.
 */
export function useSceneryBackup() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async () => {
      const result = await window.addonManagerAPI.scenery.backup();
      if (!result.ok) {
        throw new Error(getSceneryErrorMessage(result.error as SceneryError));
      }
      return result.value;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: addonKeys.sceneryBackups });
    },
  });
}

/**
 * List available backups.
 */
export function useSceneryBackups(enabled = true) {
  return useQuery({
    queryKey: addonKeys.sceneryBackups,
    queryFn: () => window.addonManagerAPI.scenery.listBackups(),
    enabled,
  });
}

/**
 * Restore from backup.
 */
export function useSceneryRestore() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (backupPath: string) => {
      const result = await window.addonManagerAPI.scenery.restore(backupPath);
      if (!result.ok) {
        throw new Error(getSceneryErrorMessage(result.error as SceneryError));
      }
      return result.value;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: addonKeys.sceneryList });
      queryClient.invalidateQueries({ queryKey: addonKeys.sceneryBackups });
    },
  });
}
