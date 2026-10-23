/**
 * One ATC vocabulary for the map, the airport panel and the hover tooltip: the role behind a
 * callsign, its colour and its letter.
 */
import type { AtcRole, NetworkStation } from '@/types/networkTraffic';

/** Role colour per the design tokens: --cat-sky, --cat-emerald, --cat-red, --cat-orange,
 * --cat-teal, --cat-amber. The sector layer and the panel badges use the same set. */
export const ATC_ROLE_COLORS: Record<AtcRole, string> = {
  DEL: '#1bc3f3',
  GND: '#68ca80',
  TWR: '#fe8b83',
  APP: '#f49752',
  CTR: '#00cdc5',
  FSS: '#00cdc5',
  ATIS: '#daa932',
  OTHER: '#717880',
};

export type AtcBadgeVariant =
  'secondary' | 'cat-sky' | 'cat-emerald' | 'cat-red' | 'cat-orange' | 'cat-teal' | 'cat-amber';

export const ATC_ROLE_BADGE_VARIANTS: Record<AtcRole, AtcBadgeVariant> = {
  DEL: 'cat-sky',
  GND: 'cat-emerald',
  TWR: 'cat-red',
  APP: 'cat-orange',
  CTR: 'cat-teal',
  FSS: 'cat-teal',
  ATIS: 'cat-amber',
  OTHER: 'secondary',
};

/** Roles that belong to an airport, in the order the label strip shows them. */
export const AIRPORT_STRIP_ROLES = ['DEL', 'GND', 'TWR', 'APP'] as const;
export type AirportStripRole = (typeof AIRPORT_STRIP_ROLES)[number];

export const ATC_ROLE_LETTERS: Record<AirportStripRole, string> = {
  DEL: 'D',
  GND: 'G',
  TWR: 'T',
  APP: 'A',
};

/** Ring colour precedence: the most capable position online wins. */
const TOP_ROLE_ORDER: AtcRole[] = ['APP', 'TWR', 'GND', 'DEL', 'ATIS', 'CTR', 'FSS', 'OTHER'];

export function topRole(roles: Iterable<AtcRole>): AtcRole {
  const set = new Set(roles);
  return TOP_ROLE_ORDER.find((r) => set.has(r)) ?? 'OTHER';
}

/** Sort order for a frequency list: the order a pilot works them. */
const LIST_ORDER: Record<AtcRole, number> = {
  ATIS: 0,
  DEL: 1,
  GND: 2,
  TWR: 3,
  APP: 4,
  CTR: 5,
  FSS: 6,
  OTHER: 7,
};

export function sortStations(stations: NetworkStation[]): NetworkStation[] {
  return stations
    .slice()
    .sort(
      (a, b) => LIST_ORDER[a.role] - LIST_ORDER[b.role] || a.callsign.localeCompare(b.callsign)
    );
}

export function callsignParts(callsign: string): string[] {
  return callsign.toUpperCase().split('_').filter(Boolean);
}

/** The role from the callsign suffix; DEP counts as APP and RMP as GND. */
export function roleFromCallsign(callsign: string): AtcRole {
  switch (callsignParts(callsign).at(-1) ?? '') {
    case 'ATIS':
      return 'ATIS';
    case 'DEL':
      return 'DEL';
    case 'GND':
    case 'RMP':
      return 'GND';
    case 'TWR':
      return 'TWR';
    case 'APP':
    case 'DEP':
      return 'APP';
    case 'CTR':
      return 'CTR';
    case 'FSS':
      return 'FSS';
    default:
      return 'OTHER';
  }
}

/** Label for a station in a list: the role, with the ATIS letter when it has one. */
export function stationLabel(station: NetworkStation): string {
  if (station.role === 'ATIS') return station.atis?.code ? `ATIS ${station.atis.code}` : 'ATIS';
  return station.role === 'OTHER' ? 'ATC' : station.role;
}
