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
import { type FlightEditInput, flightEditInput } from '@/lib/flightRecorder/flightEdit';
import type { FlightSummary } from '@/types/flightRecorder';

interface FlightEditDialogProps {
  open: boolean;
  /** The flight being edited; null when adding one by hand. */
  flight: FlightSummary | null;
  saving: boolean;
  onClose: () => void;
  onSubmit: (input: FlightEditInput) => void;
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
      <DialogContent className="max-w-xl">
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
  const text = (key: keyof FlightEditInput) => (e: Change) => set(key, e.target.value);
  const icao = (key: keyof FlightEditInput) => (e: Change) =>
    set(key, e.target.value.toUpperCase());
  const minutes = (key: 'blockTimeSec' | 'airTimeSec') => (e: Change) =>
    set(key, Math.max(0, Math.round(Number(e.target.value) || 0)) * 60);
  const change = {
    startedAt: (e: Change) => set('startedAt', fromLocalInput(e.target.value, form.startedAt)),
    departureIcao: icao('departureIcao'),
    departureName: text('departureName'),
    arrivalIcao: icao('arrivalIcao'),
    arrivalName: text('arrivalName'),
    aircraftIcao: icao('aircraftIcao'),
    aircraftName: text('aircraftName'),
    livery: text('livery'),
    blockTimeSec: minutes('blockTimeSec'),
    airTimeSec: minutes('airTimeSec'),
    distanceNm: (e: Change) => set('distanceNm', Math.max(0, Number(e.target.value) || 0)),
    landingCount: (e: Change) =>
      set('landingCount', Math.max(0, Math.round(Number(e.target.value) || 0))),
  };
  const toMinutes = (sec: number) => String(Math.round(sec / 60));

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit(form);
      }}
      className="space-y-4"
    >
      <DialogHeader>
        <DialogTitle>{flight ? t('logbook.editFlight') : t('logbook.addFlight')}</DialogTitle>
        <DialogDescription>
          {flight ? t('logbook.edit.editHint') : t('logbook.edit.manualHint')}
        </DialogDescription>
      </DialogHeader>

      <div className="grid gap-3">
        <Field label={t('logbook.edit.date')}>
          <Input
            type="datetime-local"
            value={toLocalInput(form.startedAt)}
            onChange={change.startedAt}
          />
        </Field>

        <div className="grid grid-cols-[6rem_1fr] gap-3">
          <Field label={`${t('logbook.edit.departure')} · ${t('logbook.edit.icao')}`}>
            <Input
              value={form.departureIcao}
              maxLength={4}
              className="font-mono uppercase"
              onChange={change.departureIcao}
            />
          </Field>
          <Field label={t('logbook.edit.airportName')}>
            <Input value={form.departureName} onChange={change.departureName} />
          </Field>
        </div>

        <div className="grid grid-cols-[6rem_1fr] gap-3">
          <Field label={`${t('logbook.edit.arrival')} · ${t('logbook.edit.icao')}`}>
            <Input
              value={form.arrivalIcao}
              maxLength={4}
              className="font-mono uppercase"
              onChange={change.arrivalIcao}
            />
          </Field>
          <Field label={t('logbook.edit.airportName')}>
            <Input value={form.arrivalName} onChange={change.arrivalName} />
          </Field>
        </div>

        <div className="grid grid-cols-[6rem_1fr_1fr] gap-3">
          <Field label={t('logbook.edit.aircraftIcao')}>
            <Input
              value={form.aircraftIcao}
              maxLength={4}
              className="font-mono uppercase"
              onChange={change.aircraftIcao}
            />
          </Field>
          <Field label={t('logbook.edit.aircraftName')}>
            <Input value={form.aircraftName} onChange={change.aircraftName} />
          </Field>
          <Field label={t('logbook.edit.livery')}>
            <Input value={form.livery} onChange={change.livery} />
          </Field>
        </div>

        <div className="grid grid-cols-4 gap-3">
          <Field label={t('logbook.edit.blockMinutes')}>
            <Input
              type="number"
              min={0}
              value={toMinutes(form.blockTimeSec)}
              onChange={change.blockTimeSec}
            />
          </Field>
          <Field label={t('logbook.edit.airMinutes')}>
            <Input
              type="number"
              min={0}
              value={toMinutes(form.airTimeSec)}
              onChange={change.airTimeSec}
            />
          </Field>
          <Field label={t('logbook.edit.distanceNm')}>
            <Input
              type="number"
              min={0}
              step="0.1"
              value={String(Math.round(form.distanceNm * 10) / 10)}
              onChange={change.distanceNm}
            />
          </Field>
          <Field label={t('logbook.edit.landings')}>
            <Input
              type="number"
              min={0}
              value={String(form.landingCount)}
              onChange={change.landingCount}
            />
          </Field>
        </div>
      </div>

      <DialogFooter>
        <Button type="button" variant="ghost" onClick={onClose}>
          {t('common.cancel')}
        </Button>
        <Button type="submit" disabled={saving}>
          {flight ? t('common.save') : t('common.add')}
        </Button>
      </DialogFooter>
    </form>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <Label className="xp-label">{label}</Label>
      {children}
    </div>
  );
}
