import { type RefObject, useEffect, useMemo, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { ArrowRight, X } from 'lucide-react';
import * as maplibregl from 'maplibre-gl';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { useUnits } from '@/hooks/useUnits';
import type { Degrees, Feet } from '@/lib/utils/geomath';
import type { Knots } from '@/lib/utils/units';
import { buildAirportAtcRows } from '@/lib/vatsimSectors/airportAtc';
import { buildAirportAtcSummaries } from '@/lib/vatsimSectors/match';
import type { Airport } from '@/lib/xplaneServices/dataService';
import { type VatsimSelection, useMapStore } from '@/stores/mapStore';
import type { VatsimATIS, VatsimController, VatsimData, VatsimPilot } from '@/types/vatsim';

const PILOT_OFFSET_PX = 14;
// Clears the ATC badges, which sit above the airport point.
const AIRPORT_OFFSET_PX = 34;

interface VatsimPopupProps {
  mapRef: RefObject<maplibregl.Map | null>;
  airports: Airport[];
  vatsimData: VatsimData | undefined;
}

type Resolved =
  | { kind: 'pilot'; pilot: VatsimPilot }
  | { kind: 'airport'; airport: Airport; controllers: (VatsimController | VatsimATIS)[] };

function resolveSelection(
  selection: VatsimSelection | null,
  vatsimData: VatsimData | undefined,
  airports: Airport[]
): Resolved | null {
  if (!selection || !vatsimData) return null;
  if (selection.kind === 'pilot') {
    const pilot = vatsimData.pilots.find((p) => p.cid === selection.cid);
    return pilot ? { kind: 'pilot', pilot } : null;
  }
  const airport = airports.find((a) => a.icao.toUpperCase() === selection.icao);
  const summary = buildAirportAtcSummaries(vatsimData, airports).find(
    (s) => s.icao === selection.icao
  );
  return airport && summary ? { kind: 'airport', airport, controllers: summary.controllers } : null;
}

/** Card anchored to a clicked VATSIM pilot or staffed airport, refreshed with every poll. */
export default function VatsimPopup({ mapRef, airports, vatsimData }: VatsimPopupProps) {
  const selection = useMapStore((s) => s.vatsimSelection);
  const setSelection = useMapStore((s) => s.setVatsimSelection);
  const container = useMemo(() => document.createElement('div'), []);
  const popupRef = useRef<maplibregl.Popup | null>(null);

  const resolved = useMemo(
    () => resolveSelection(selection, vatsimData, airports),
    [selection, vatsimData, airports]
  );
  const position: [number, number] | null = resolved
    ? resolved.kind === 'pilot'
      ? [resolved.pilot.longitude, resolved.pilot.latitude]
      : [resolved.airport.lon, resolved.airport.lat]
    : null;
  const positionRef = useRef(position);
  const isOpen = position !== null;

  // Declared before the popup effect so a new popup opens at the current position.
  useEffect(() => {
    positionRef.current = position;
  });

  // A pilot who logged off or an airport whose last controller left.
  useEffect(() => {
    if (selection && vatsimData && !resolved) setSelection(null);
  }, [selection, vatsimData, resolved, setSelection]);

  useEffect(() => () => setSelection(null), [setSelection]);

  useEffect(() => {
    const map = mapRef.current;
    const initial = positionRef.current;
    if (!map || !selection || !isOpen || !initial) return;
    const popup = new maplibregl.Popup({
      closeButton: false,
      closeOnClick: true,
      className: 'vatsim-popup',
      maxWidth: 'none',
      offset: selection.kind === 'pilot' ? PILOT_OFFSET_PX : AIRPORT_OFFSET_PX,
    })
      .setLngLat(initial)
      .setDOMContent(container)
      .addTo(map);
    popupRef.current = popup;
    // A click on another pilot or airport replaces the selection before this popup closes.
    popup.on('close', () => {
      if (useMapStore.getState().vatsimSelection === selection) setSelection(null);
    });
    return () => {
      popupRef.current = null;
      popup.remove();
    };
  }, [selection, isOpen, mapRef, container, setSelection]);

  const lng = position?.[0];
  const lat = position?.[1];
  useEffect(() => {
    if (lng !== undefined && lat !== undefined) popupRef.current?.setLngLat([lng, lat]);
  }, [lng, lat]);

  if (!resolved) return null;
  const onClose = () => setSelection(null);
  return createPortal(
    resolved.kind === 'pilot' ? (
      <PilotCard pilot={resolved.pilot} onClose={onClose} />
    ) : (
      <AirportAtcCard
        airport={resolved.airport}
        controllers={resolved.controllers}
        onClose={onClose}
      />
    ),
    container
  );
}

/** VATSIM filed altitudes come as "35000", "FL350", "F350" or "A050". */
function parseFiledAltitudeFt(filed: string): number | null {
  const value = filed.trim().toUpperCase();
  const level = value.match(/^(?:FL|F|A)(\d{2,3})$/);
  if (level) return Number(level[1]) * 100;
  if (/^\d+$/.test(value)) return Number(value);
  return null;
}

function PilotCard({ pilot, onClose }: { pilot: VatsimPilot; onClose: () => void }) {
  const { t } = useTranslation();
  const units = useUnits();
  const plan = pilot.flight_plan;
  const aircraft = plan?.aircraft_short || plan?.aircraft_faa;
  const filedFt = plan ? parseFiledAltitudeFt(plan.altitude) : null;
  const route = plan?.route.trim();

  return (
    <Shell>
      <Header
        title={pilot.callsign}
        tag={plan?.flight_rules === 'I' ? 'IFR' : plan?.flight_rules === 'V' ? 'VFR' : undefined}
        subtitle={pilot.name}
        onClose={onClose}
      />

      {plan?.departure || plan?.arrival ? (
        <div className="mt-2 flex items-baseline gap-1.5 font-mono">
          <span className="text-sm font-bold">{plan.departure || '----'}</span>
          <ArrowRight className="text-muted-foreground h-3 w-3 self-center" />
          <span className="text-sm font-bold">{plan.arrival || '----'}</span>
          {plan.alternate && <span className="text-muted-foreground">({plan.alternate})</span>}
        </div>
      ) : (
        <div className="text-muted-foreground mt-2">{t('vatsimPopup.noFlightPlan')}</div>
      )}

      <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1">
        <Row
          label={t('vatsimPopup.altitude')}
          value={units.altitude(pilot.altitude as Feet)}
          accent
        />
        {filedFt !== null && filedFt > 0 && (
          <Row label={t('vatsimPopup.filedAltitude')} value={units.altitude(filedFt as Feet)} />
        )}
        <Row
          label={t('vatsimPopup.groundSpeed')}
          value={units.speed(pilot.groundspeed as Knots)}
          accent
        />
        <Row
          label={t('vatsimPopup.heading')}
          value={units.course(pilot.heading as Degrees, pilot.latitude, pilot.longitude)}
        />
        {aircraft && <Row label={t('vatsimPopup.aircraft')} value={aircraft} />}
        {pilot.transponder && <Row label={t('vatsimPopup.squawk')} value={pilot.transponder} />}
      </dl>

      {route && (
        <div className="border-border/40 mt-2 border-t pt-2">
          <div className="text-muted-foreground">{t('vatsimPopup.route')}</div>
          <div className="mt-0.5 max-h-20 overflow-y-auto font-mono break-words">{route}</div>
        </div>
      )}
    </Shell>
  );
}

function AirportAtcCard({
  airport,
  controllers,
  onClose,
}: {
  airport: Airport;
  controllers: (VatsimController | VatsimATIS)[];
  onClose: () => void;
}) {
  const rows = buildAirportAtcRows(
    controllers.filter((c): c is VatsimController => !('atis_code' in c)),
    controllers.filter((c): c is VatsimATIS => 'atis_code' in c)
  );

  return (
    <Shell>
      <Header title={airport.icao} subtitle={airport.name} onClose={onClose} />
      <div className="divide-border/40 mt-2 max-h-72 divide-y overflow-y-auto">
        {rows.map((row) => (
          <div key={row.id} className="py-1.5 first:pt-0 last:pb-0">
            <div className="flex items-center gap-2">
              <Badge
                variant={row.badgeVariant}
                className="text-2xs shrink-0 px-1.5 py-0 font-mono uppercase"
              >
                {row.badgeLabel}
              </Badge>
              <span className="min-w-0 flex-1 truncate font-mono font-semibold">
                {row.callsign}
              </span>
              <span className="text-primary font-mono tabular-nums">{row.frequency}</span>
            </div>
            <div className="text-muted-foreground mt-0.5 truncate">{row.summary}</div>
            {row.detail && (
              <div className="text-muted-foreground mt-1 font-mono break-words">{row.detail}</div>
            )}
          </div>
        ))}
      </div>
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="border-border/50 bg-card/95 w-72 rounded-xl border p-3 text-xs shadow-xl backdrop-blur-xl">
      {children}
    </div>
  );
}

function Header({
  title,
  tag,
  subtitle,
  onClose,
}: {
  title: string;
  tag?: string;
  subtitle?: string;
  onClose: () => void;
}) {
  return (
    <div className="flex items-start justify-between gap-2">
      <div className="min-w-0">
        <div className="flex items-center gap-1.5">
          <span className="text-info font-mono text-sm font-bold">{title}</span>
          {tag && (
            <Badge variant="secondary" className="text-2xs px-1.5 py-0 font-mono">
              {tag}
            </Badge>
          )}
        </div>
        {subtitle && <div className="text-muted-foreground truncate">{subtitle}</div>}
      </div>
      <Button variant="ghost" size="icon-xs" className="-mt-1 -mr-1" onClick={onClose}>
        <X className="h-3.5 w-3.5" />
      </Button>
    </div>
  );
}

function Row({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <>
      <dt className="text-muted-foreground">{label}</dt>
      <dd className={accent ? 'text-primary font-mono tabular-nums' : 'font-mono tabular-nums'}>
        {value}
      </dd>
    </>
  );
}
