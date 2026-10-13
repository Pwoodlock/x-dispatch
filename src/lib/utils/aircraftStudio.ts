import type { Aircraft } from '@/types/aircraft';

/**
 * Who made the add-on, from the .acf studio field, cleaned of the trailing commas some
 * authors leave and dropped when it only repeats the manufacturer.
 */
export function aircraftStudio(aircraft: Pick<Aircraft, 'studio' | 'manufacturer'>): string {
  const studio = aircraft.studio.replace(/[\s,]+$/, '').trim();
  if (!studio || studio.toLowerCase() === aircraft.manufacturer.toLowerCase()) return '';
  return studio;
}

/** "4.05.35" becomes "v4.05.35"; an existing v prefix is kept as is. */
export function aircraftVersionLabel(aircraft: Pick<Aircraft, 'version'>): string {
  if (!aircraft.version) return '';
  return /^v/i.test(aircraft.version) ? aircraft.version : `v${aircraft.version}`;
}

/**
 * The folder that holds the .acf. Pilots copy an aircraft folder to try a mod without
 * renaming the aircraft, so the folder is what tells the copies apart.
 */
export function aircraftFolder(path: string): string {
  const parts = path.split(/[\\/]/);
  return parts.length > 1 ? (parts[parts.length - 2] ?? '') : '';
}

function fileName(path: string): string {
  return path.split(/[\\/]/).pop() ?? path;
}

function allDifferent(values: string[]): boolean {
  return new Set(values).size === values.length;
}

/**
 * A short label for each aircraft whose name another aircraft shares, keyed by path: the
 * folder when the copies sit in different folders (a mod copied next to the original),
 * the file when they share one (variants such as floats), else the path inside Aircraft.
 */
export function aircraftCopyLabels(
  list: readonly Pick<Aircraft, 'name' | 'path'>[]
): Map<string, string> {
  const byName = new Map<string, string[]>();
  for (const { name, path } of list) byName.set(name, [...(byName.get(name) ?? []), path]);
  const labels = new Map<string, string>();
  for (const paths of byName.values()) {
    if (paths.length < 2) continue;
    const folders = paths.map(aircraftFolder);
    const files = paths.map(fileName);
    const label = allDifferent(folders)
      ? aircraftFolder
      : allDifferent(files)
        ? fileName
        : (path: string) => path.replace(/^Aircraft[\\/]/, '');
    for (const path of paths) labels.set(path, label(path));
  }
  return labels;
}
