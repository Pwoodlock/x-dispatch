import { useTranslation } from 'react-i18next';
import { GalleryHorizontal } from 'lucide-react';
import {
  FLIGHT_STRIP_FIELDS,
  FLIGHT_STRIP_READOUTS,
  type FlightStripField,
  withFieldVisible,
} from '@/lib/flightStrip/fields';
import { cn } from '@/lib/utils/helpers';
import { useFlightStripWindowOpen } from '@/queries';
import { useSettingsStore } from '@/stores/settingsStore';
import {
  SettingsHeader,
  SettingsSectionBlock,
  SettingsSliderRow,
  SettingsToggleRow,
} from '../primitives';
import type { SettingsSectionProps } from '../types';

const isLinux = window.appAPI?.platform === 'linux';
const isRemote = window.appAPI?.isRemoteClient === true;

/** Turns one field's row into its translation keys (`speed` → `fieldSpeed`). */
function fieldKey(field: FlightStripField): string {
  return `field${field.charAt(0).toUpperCase()}${field.slice(1)}`;
}

/**
 * Everything about the live aircraft strip: the detached window over the simulator
 * (click-through lock, stacking, auto-open, opacity), its size on the map, and which
 * readouts it shows. One set of readouts drives the map strip and the window alike.
 */
export default function FlightStripSection({ className }: SettingsSectionProps) {
  const { t } = useTranslation();
  const flightStrip = useSettingsStore((s) => s.flightStrip);
  const updateFlightStripSettings = useSettingsStore((s) => s.updateFlightStripSettings);
  const setFlightStripScale = useSettingsStore((s) => s.setFlightStripScale);
  const setFlightStripOpacity = useSettingsStore((s) => s.setFlightStripOpacity);
  const setFlightStripField = useSettingsStore((s) => s.setFlightStripField);
  const windowOpen = useFlightStripWindowOpen();

  const previewOpacity = (percent: number) =>
    window.appAPI.setFlightStripWindowOptions({
      locked: flightStrip.locked,
      alwaysOnTop: flightStrip.alwaysOnTop,
      opacity: percent / 100,
    });

  return (
    <div className={cn('space-y-6', className)}>
      <SettingsHeader
        icon={GalleryHorizontal}
        title={t('settings.flightStrip.title')}
        description={t('settings.flightStrip.description')}
      />

      {/* The detached window only exists on the desktop */}
      {!isRemote && (
        <SettingsSectionBlock
          title={t('settings.flightStrip.window')}
          description={t('settings.flightStrip.windowDescription')}
        >
          <div className="space-y-3">
            <SettingsToggleRow
              title={t('settings.flightStrip.showWindow')}
              description={t('settings.flightStrip.showWindowDescription')}
              checked={windowOpen}
              onCheckedChange={() => void window.appAPI.openFlightStripWindow()}
            />
            <SettingsToggleRow
              title={t('settings.flightStrip.lock')}
              description={t(
                isLinux
                  ? 'settings.flightStrip.lockDescriptionLinux'
                  : 'settings.flightStrip.lockDescription'
              )}
              checked={flightStrip.locked}
              onCheckedChange={(locked) => updateFlightStripSettings({ locked })}
            />
            <SettingsToggleRow
              title={t('settings.flightStrip.alwaysOnTop')}
              description={t('settings.flightStrip.alwaysOnTopDescription')}
              checked={flightStrip.alwaysOnTop}
              onCheckedChange={(alwaysOnTop) => updateFlightStripSettings({ alwaysOnTop })}
            />
            <SettingsToggleRow
              title={t('settings.flightStrip.autoOpen')}
              description={t('settings.flightStrip.autoOpenDescription')}
              checked={flightStrip.autoOpen}
              onCheckedChange={(autoOpen) => updateFlightStripSettings({ autoOpen })}
            />
          </div>
        </SettingsSectionBlock>
      )}

      <SettingsSectionBlock title={t('settings.flightStrip.look')}>
        <div className="space-y-3">
          <SettingsSliderRow
            title={t('settings.flightStrip.scale')}
            description={t('settings.flightStrip.scaleDescription')}
            value={Math.round(flightStrip.scale * 100)}
            defaultValue={100}
            min={100}
            max={200}
            step={10}
            onCommit={(percent) => setFlightStripScale(percent / 100)}
            resetLabel={t('settings.flightStrip.reset')}
          />
          {/* Electron cannot change window opacity on Linux */}
          {!isLinux && !isRemote && (
            <SettingsSliderRow
              title={t('settings.flightStrip.opacity')}
              description={t('settings.flightStrip.opacityDescription')}
              value={Math.round(flightStrip.opacity * 100)}
              defaultValue={100}
              min={30}
              max={100}
              step={5}
              onCommit={(percent) => setFlightStripOpacity(percent / 100)}
              onPreview={previewOpacity}
              resetLabel={t('settings.flightStrip.reset')}
            />
          )}
        </div>
      </SettingsSectionBlock>

      <SettingsSectionBlock
        title={t('settings.flightStrip.readouts')}
        description={t('settings.flightStrip.readoutsDescription')}
      >
        <SettingsToggleRow
          title={t('settings.flightStrip.preview')}
          description={t('settings.flightStrip.previewDescription')}
          checked={flightStrip.preview}
          onCheckedChange={(preview) => updateFlightStripSettings({ preview })}
        />
        <div className="grid gap-3 sm:grid-cols-2">
          {FLIGHT_STRIP_FIELDS.map((field) => {
            const visible = flightStrip.fields[field];
            // The last readout left on cannot be turned off.
            const locked =
              visible &&
              (FLIGHT_STRIP_READOUTS as readonly string[]).includes(field) &&
              withFieldVisible(flightStrip.fields, field, false) === flightStrip.fields;
            return (
              <SettingsToggleRow
                key={field}
                title={t(`settings.flightStrip.${fieldKey(field)}`)}
                description={t(`settings.flightStrip.${fieldKey(field)}Description`)}
                checked={visible}
                disabled={locked}
                onCheckedChange={(checked) => setFlightStripField(field, checked)}
              />
            );
          })}
        </div>
      </SettingsSectionBlock>
    </div>
  );
}
