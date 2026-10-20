import { type RefObject, useEffect, useMemo, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { Route, X } from 'lucide-react';
import * as maplibregl from 'maplibre-gl';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { IcaoCode } from '@/components/ui/icao-code';
import { Progress } from '@/components/ui/progress';
import { useUnits } from '@/hooks/useUnits';
import { canPlanFromPilot, openPlannerForPilot } from '@/lib/networkTraffic/planFromPilot';
import { flightProgress } from '@/lib/networkTraffic/progress';
import type { Degrees, Feet, NauticalMiles } from '@/lib/utils/geomath';
import type { Knots } from '@/lib/utils/units';
import type { Airport } from '@/lib/xplaneServices/dataService';
import { trackEvent } from '@/queries';
import { useMapStore } from '@/stores/mapStore';
import type { NetworkPilot } from '@/types/networkTraffic';

const PILOT_OFFSET_PX = 14;

interface NetworkPopupProps {
  mapRef: RefObject<maplibregl.Map | null>;
  airports: Airport[];
  pilots: NetworkPilot[];
}

/** Card anchored to a clicked network pilot, refreshed with every poll. */
export default function NetworkPopup({ mapRef, airports, pilots }: NetworkPopupProps) {
  const selection = useMapStore((s) => s.networkSelection);
  const setSelection = useMapStore((s) => s.setNetworkSelection);
  const container = useMemo(() => document.createElement('div'), []);
  const popupRef = useRef<maplibregl.Popup | null>(null);

  const resolved = useMemo(
    () =>
      selection
        ? pilots.find((p) => p.network === selection.network && p.id === selection.id)
        : undefined,
    [selection, pilots]
  );
  const position: [number, number] | null = resolved
    ? [resolved.longitude, resolved.latitude]
    : null;
  const positionRef = useRef(position);
  const isOpen = position !== null;

  // Declared before the popup effect so a new popup opens at the current position.
  useEffect(() => {
    positionRef.current = position;
  });

  // A pilot who logged off or an airport whose last controller left.
  useEffect(() => {
    if (selection && !resolved) setSelection(null);
  }, [selection, resolved, setSelection]);

  useEffect(() => () => setSelection(null), [setSelection]);

  useEffect(() => {
    const map = mapRef.current;
    const initial = positionRef.current;
    if (!map || !selection || !isOpen || !initial) return;
    const popup = new maplibregl.Popup({
      closeButton: false,
      closeOnClick: true,
      className: 'network-popup',
      maxWidth: 'none',
      offset: PILOT_OFFSET_PX,
    })
      .setLngLat(initial)
      .setDOMContent(container)
      .addTo(map);
    popupRef.current = popup;
    // A click on another pilot or airport replaces the selection before this popup closes.
    popup.on('close', () => {
      if (useMapStore.getState().networkSelection === selection) setSelection(null);
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
    <PilotCard pilot={resolved} airports={airports} onClose={onClose} />,
    container
  );
}

function PilotCard({
  pilot,
  airports,
  onClose,
}: {
  pilot: NetworkPilot;
  airports: Airport[];
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const units = useUnits();
  const plan = pilot.flightPlan;
  const airportAt = (icao: string | null | undefined) => {
    const a = icao ? airports.find((x) => x.icao === icao) : undefined;
    return a ? { latitude: a.lat, longitude: a.lon } : null;
  };
  const progress = flightProgress(pilot, airportAt(plan?.departure), airportAt(plan?.arrival));
  const canPlan = canPlanFromPilot(airports, pilot);
  const subtitle = [plan?.aircraft, pilot.name].filter(Boolean).join(', ');

  const usePlan = () => {
    if (!openPlannerForPilot(airports, pilot)) return;
    trackEvent('network_plan_used', { network: pilot.network });
    onClose();
  };

  return (
    <Shell>
      <Header
        title={pilot.callsign}
        tag={plan?.flightRules ?? undefined}
        subtitle={subtitle || undefined}
        onClose={onClose}
      />

      {plan?.departure || plan?.arrival ? (
        <div className="mt-2.5">
          <div className="flex items-center justify-between gap-2">
            <IcaoCode className="text-sm">{plan.departure ?? '----'}</IcaoCode>
            <span className="text-muted-foreground text-2xs min-w-0 truncate tracking-wider uppercase">
              {t(`networkPopup.phase.${progress.phase}`)}
            </span>
            <IcaoCode className="text-sm">{plan.arrival ?? '----'}</IcaoCode>
          </div>
          <Progress value={progress.percent ?? 0} className="mt-1.5 h-1" />
          {progress.flownNm !== null && progress.remainingNm !== null && (
            <div className="text-muted-foreground text-2xs mt-1 flex justify-between font-mono tabular-nums">
              <span>
                {t('networkPopup.flown', {
                  distance: units.distance(progress.flownNm as NauticalMiles),
                })}
              </span>
              <span>
                {t('networkPopup.remaining', {
                  distance: units.distance(progress.remainingNm as NauticalMiles),
                })}
              </span>
            </div>
          )}
        </div>
      ) : (
        <div className="text-muted-foreground mt-2">{t('networkPopup.noFlightPlan')}</div>
      )}

      <dl className="mt-2.5 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1">
        <Row
          label={t('networkPopup.altitude')}
          value={units.altitude(pilot.altitudeFt as Feet)}
          accent
        />
        {plan?.cruiseAltitudeFt !== null && plan?.cruiseAltitudeFt !== undefined && (
          <Row
            label={t('networkPopup.filedAltitude')}
            value={units.altitude(plan.cruiseAltitudeFt as Feet)}
          />
        )}
        <Row
          label={t('networkPopup.groundSpeed')}
          value={units.speed(pilot.groundspeedKts as Knots)}
          accent
        />
        <Row
          label={t('networkPopup.heading')}
          value={units.course(pilot.headingDeg as Degrees, pilot.latitude, pilot.longitude)}
        />
        {plan?.alternate && <Row label={t('networkPopup.alternate')} value={plan.alternate} />}
        {pilot.transponder && <Row label={t('networkPopup.squawk')} value={pilot.transponder} />}
      </dl>

      {plan?.route && (
        <div className="border-border/40 mt-2 border-t pt-2">
          <div className="text-muted-foreground">{t('networkPopup.route')}</div>
          <div className="mt-0.5 max-h-20 overflow-y-auto font-mono break-words">{plan.route}</div>
        </div>
      )}

      {plan?.departure && plan.arrival && (
        <div className="border-border/40 mt-2 border-t pt-2">
          {canPlan ? (
            <Button variant="secondary" size="xs" className="w-full" onClick={usePlan}>
              <Route className="h-3.5 w-3.5" />
              <span className="truncate">{t('networkPopup.useAsPlan')}</span>
            </Button>
          ) : (
            <div className="text-muted-foreground">{t('networkPopup.airportsUnknown')}</div>
          )}
        </div>
      )}
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="border-border/50 bg-card/95 w-72 rounded-lg border p-3 text-xs backdrop-blur-xl">
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
