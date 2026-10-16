import { type ChangeEvent, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { type FlightEditInput, flightEditInput } from '@/lib/flightRecorder/flightEdit';
import { useAircraftList } from '@/queries';
import type { Aircraft } from '@/types/aircraft';
import type { FlightSummary } from '@/types/flightRecorder';

interface FlightEditDialogProps {
  open: boolean;
  /** The flight being edited; null when adding one by hand. */
  flight: FlightSummary | null;
  saving: boolean;
  onClose: () => void;
  onSubmit: (input: FlightEditInput) => void;
}

/** The logbook panel sits at z-60; this dialog and its overlay open on top of it. */
const STACKED_OVER_LOGBOOK = { className: 'z-[100] max-w-xl', overlayClassName: 'z-[100]' };
/** Select popups portal to the body, so they need to clear the dialog as well. */
const SELECT_POPUP = { className: 'z-[110]' };
/** Radix Select cannot hold an empty value: stand-ins for "as recorded" and "no livery". */
const KEEP_RECORDED = '__recorded__';
const NO_LIVERY = '__default__';

/** The installed aircraft a logged flight was flown in, matched the way the recorder names them. */
function installedAircraft(list: Aircraft[], form: FlightEditInput): Aircraft | undefined {
  return (
    list.find((a) => a.name === form.aircraftName && a.icao === form.aircraftIcao) ??
    list.find((a) => a.name === form.aircraftName)
  );
}

/** `datetime-local` wants local wall time without a zone. */
function toLocalInput(epochMs: number): string {
  const d = new Date(epochMs);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function fromLocalInput(value: string, fallback: number): number {
  const t = new Date(value).getTime();
  return Number.isFinite(t) ? t : fallback;
}

function blankInput(): FlightEditInput {
  const now = new Date();
  now.setSeconds(0, 0);
  return {
    startedAt: now.getTime(),
    departureIcao: '',
    departureName: '',
    arrivalIcao: '',
    arrivalName: '',
    aircraftIcao: '',
    aircraftName: '',
    livery: '',
    blockTimeSec: 0,
    airTimeSec: 0,
    distanceNm: 0,
    landingCount: 1,
  };
}

export function FlightEditDialog({
  open,
  flight,
  saving,
  onClose,
  onSubmit,
}: FlightEditDialogProps) {
  return (
    <Dialog open={open} onOpenChange={(isOpen) => !isOpen && onClose()}>
      <DialogContent {...STACKED_OVER_LOGBOOK}>
        {open && (
          // Keyed so a different flight, or a new one, starts from its own values.
          <FlightEditForm
            key={flight?.id ?? 'new'}
            flight={flight}
            saving={saving}
            onClose={onClose}
            onSubmit={onSubmit}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

type Change = ChangeEvent<HTMLInputElement>;

const MONO = 'font-mono text-xs';
const CODE = 'font-mono text-xs uppercase';

function FlightEditForm({
  flight,
  saving,
  onClose,
  onSubmit,
}: Omit<FlightEditDialogProps, 'open'>) {
  const { t } = useTranslation();
  const [form, setForm] = useState<FlightEditInput>(() =>
    flight ? flightEditInput(flight) : blankInput()
  );

  const set = <K extends keyof FlightEditInput>(key: K, value: FlightEditInput[K]) =>
    setForm((f) => ({ ...f, [key]: value }));
  // The name is looked up from the airport database on save; a changed code drops the old one.
  const airport =
    (icaoKey: 'departureIcao' | 'arrivalIcao', nameKey: 'departureName' | 'arrivalName') =>
    (e: Change) =>
      setForm((f) => ({ ...f, [icaoKey]: e.target.value.toUpperCase(), [nameKey]: '' }));
  const minutes = (key: 'blockTimeSec' | 'airTimeSec') => (e: Change) =>
    set(key, Math.max(0, Math.round(Number(e.target.value) || 0)) * 60);
  const change = {
    startedAt: (e: Change) => set('startedAt', fromLocalInput(e.target.value, form.startedAt)),
    departureIcao: airport('departureIcao', 'departureName'),
    arrivalIcao: airport('arrivalIcao', 'arrivalName'),
    blockTimeSec: minutes('blockTimeSec'),
    airTimeSec: minutes('airTimeSec'),
    distanceNm: (e: Change) => set('distanceNm', Math.max(0, Number(e.target.value) || 0)),
    landingCount: (e: Change) =>
      set('landingCount', Math.max(0, Math.round(Number(e.target.value) || 0))),
  };
  const toMinutes = (sec: number) => String(Math.round(sec / 60));

  const { data: aircraftList = [] } = useAircraftList();
  const selected = installedAircraft(aircraftList, form);
  // A flight recorded in an aircraft that is no longer installed keeps its name.
  const recordedLabel = [form.aircraftName, form.aircraftIcao].filter(Boolean).join(' · ');
  const aircraftValue = selected?.path ?? (recordedLabel ? KEEP_RECORDED : '');
  const chooseAircraft = (path: string) => {
    if (path === KEEP_RECORDED) return;
    const next = aircraftList.find((a) => a.path === path);
    if (!next) return;
    setForm((f) => ({
      ...f,
      aircraftIcao: next.icao,
      aircraftName: next.name,
      livery: next.liveries.some((l) => l.name === f.livery) ? f.livery : '',
    }));
  };
  const liveries = selected?.liveries ?? [];
  const liveryKnown = liveries.some((l) => l.name === form.livery);
  const liveryValue = form.livery ? (liveryKnown ? form.livery : KEEP_RECORDED) : NO_LIVERY;
  const chooseLivery = (name: string) => {
    if (name === KEEP_RECORDED) return;
    set('livery', name === NO_LIVERY ? '' : name);
  };

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit(form);
      }}
    >
      <DialogHeader>
        <DialogTitle>{flight ? t('logbook.editFlight') : t('logbook.addFlight')}</DialogTitle>
        <DialogDescription>
          {flight ? t('logbook.edit.editHint') : t('logbook.edit.manualHint')}
        </DialogDescription>
      </DialogHeader>

      <div className="space-y-4 py-4">
        <div className="space-y-1.5">
          <Label htmlFor="fl-date" className="xp-label">
            {t('logbook.edit.date')}
          </Label>
          <Input
            id="fl-date"
            type="datetime-local"
            value={toLocalInput(form.startedAt)}
            onChange={change.startedAt}
            className={MONO}
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label htmlFor="fl-dep" className="xp-label">
              {t('logbook.edit.departure')}
            </Label>
            <Input
              id="fl-dep"
              value={form.departureIcao}
              maxLength={4}
              onChange={change.departureIcao}
              className={CODE}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="fl-arr" className="xp-label">
              {t('logbook.edit.arrival')}
            </Label>
            <Input
              id="fl-arr"
              value={form.arrivalIcao}
              maxLength={4}
              onChange={change.arrivalIcao}
              className={CODE}
            />
          </div>
        </div>

        <div className="grid grid-cols-[3fr_2fr] gap-3">
          <div className="space-y-1.5">
            <Label htmlFor="fl-aircraft" className="xp-label">
              {t('logbook.edit.aircraftName')}
            </Label>
            <Select value={aircraftValue} onValueChange={chooseAircraft}>
              <SelectTrigger id="fl-aircraft">
                <SelectValue placeholder={t('logbook.edit.pickAircraft')} />
              </SelectTrigger>
              <SelectContent {...SELECT_POPUP}>
                {!selected && recordedLabel && (
                  <SelectItem value={KEEP_RECORDED}>{recordedLabel}</SelectItem>
                )}
                {aircraftList.map((a) => (
                  <SelectItem key={a.path} value={a.path}>
                    {a.name}
                    {a.icao && <span className="text-muted-foreground font-mono"> · {a.icao}</span>}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="fl-livery" className="xp-label">
              {t('logbook.edit.livery')}
            </Label>
            <Select value={liveryValue} onValueChange={chooseLivery}>
              <SelectTrigger id="fl-livery">
                <SelectValue />
              </SelectTrigger>
              <SelectContent {...SELECT_POPUP}>
                <SelectItem value={NO_LIVERY}>{t('logbook.edit.defaultLivery')}</SelectItem>
                {form.livery && !liveryKnown && (
                  <SelectItem value={KEEP_RECORDED}>{form.livery}</SelectItem>
                )}
                {liveries.map((l) => (
                  <SelectItem key={l.name} value={l.name}>
                    {l.displayName || l.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="grid grid-cols-4 gap-3">
          <div className="space-y-1.5">
            <Label htmlFor="fl-block" className="xp-label">
              {t('logbook.edit.blockMinutes')}
            </Label>
            <Input
              id="fl-block"
              type="number"
              min={0}
              value={toMinutes(form.blockTimeSec)}
              onChange={change.blockTimeSec}
              className={MONO}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="fl-air" className="xp-label">
              {t('logbook.edit.airMinutes')}
            </Label>
            <Input
              id="fl-air"
              type="number"
              min={0}
              value={toMinutes(form.airTimeSec)}
              onChange={change.airTimeSec}
              className={MONO}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="fl-dist" className="xp-label">
              {t('logbook.edit.distanceNm')}
            </Label>
            <Input
              id="fl-dist"
              type="number"
              min={0}
              step="0.1"
              value={String(Math.round(form.distanceNm * 10) / 10)}
              onChange={change.distanceNm}
              className={MONO}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="fl-landings" className="xp-label">
              {t('logbook.edit.landings')}
            </Label>
            <Input
              id="fl-landings"
              type="number"
              min={0}
              value={String(form.landingCount)}
              onChange={change.landingCount}
              className={MONO}
            />
          </div>
        </div>
      </div>

      <DialogFooter>
        <Button type="button" variant="outline" onClick={onClose}>
          {t('common.cancel')}
        </Button>
        <Button type="submit" disabled={saving}>
          {flight ? t('common.save') : t('common.add')}
        </Button>
      </DialogFooter>
    </form>
  );
}
