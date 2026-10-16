import type { TaxiEdge } from '@/types/apt';

/** The other end of a numbered runway (`05` → `23`, `14L` → `32R`), or null for any other name. */
export function oppositeEnd(end: string): string | null {
  const match = /^(\d{1,2})([LCR]?)$/.exec(end);
  if (!match) return null;
  const number = Number(match[1]);
  if (number < 1 || number > 36) return null;
  const opposite = number > 18 ? number - 18 : number + 18;
  const side = ({ L: 'R', R: 'L', C: 'C', '': '' } as const)[match[2] as 'L' | 'R' | 'C' | ''];
  return String(opposite).padStart(2, '0') + side;
}

/** One key per physical runway, whichever end a zone names: both ends sorted and joined. */
export function runwayKey(end: string): string {
  const opposite = oppositeEnd(end);
  return opposite ? [end, opposite].sort().join('/') : end;
}

/**
 * Runways whose protected area the edge sits in. A zone may name one end or
 * both, so each end is filed under its runway. ILS critical areas only matter
 * in low visibility, so they are left out.
 */
export function edgeRunways(edge: TaxiEdge): string[] {
  const keys = new Set<string>();
  for (const zone of edge.activeZones ?? []) {
    if (zone.type === 'ils') continue;
    for (const end of zone.runways) keys.add(runwayKey(end));
  }
  if (edge.widthClass === 'runway' && edge.name) {
    for (const end of edge.name.split('/')) keys.add(runwayKey(end));
  }
  return [...keys];
}
