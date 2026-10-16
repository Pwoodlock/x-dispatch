import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useUnits } from '@/hooks/useUnits';
import { logbookTotals } from '@/lib/flightRecorder/flightEdit';
import { formatDuration } from '@/lib/flightRecorder/format';
import type { NauticalMiles } from '@/lib/utils/geomath';
import type { FeetPerMinute } from '@/lib/utils/units';
import type { FlightSummary } from '@/types/flightRecorder';

export function LogbookTotals({ flights }: { flights: FlightSummary[] }) {
  const { t, i18n } = useTranslation();
  const units = useUnits();
  const totals = useMemo(() => logbookTotals(flights), [flights]);

  const cells: Array<{ label: string; value: string }> = [
    { label: t('logbook.totals.flights'), value: totals.flights.toLocaleString(i18n.language) },
    { label: t('logbook.blockTime'), value: formatDuration(totals.blockTimeSec) },
    { label: t('logbook.airTime'), value: formatDuration(totals.airTimeSec) },
    { label: t('logbook.distance'), value: units.distance(totals.distanceNm as NauticalMiles) },
    { label: t('logbook.landings'), value: totals.landings.toLocaleString(i18n.language) },
    {
      label: t('logbook.totals.avgTouchdown'),
      value:
        totals.averageTouchdownRateFpm === null
          ? '—'
          : units.verticalSpeed(totals.averageTouchdownRateFpm as FeetPerMinute),
    },
    {
      label: t('logbook.totals.bestTouchdown'),
      value:
        totals.bestTouchdownRateFpm === null
          ? '—'
          : units.verticalSpeed(totals.bestTouchdownRateFpm as FeetPerMinute),
    },
  ];

  return (
    <dl className="border-border/50 bg-card/60 grid grid-cols-7 gap-x-4 border-b px-5 py-3">
      {cells.map((cell) => (
        <div key={cell.label} className="min-w-0">
          <dt className="xp-label truncate">{cell.label}</dt>
          <dd className="truncate font-mono text-sm">{cell.value}</dd>
        </div>
      ))}
    </dl>
  );
}
