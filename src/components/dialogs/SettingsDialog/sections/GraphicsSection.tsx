import { useTranslation } from 'react-i18next';
import { Monitor } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { Switch } from '@/components/ui/switch';
import { cn } from '@/lib/utils/helpers';
import type { SurfaceDetail } from '@/stores/settingsStore';
import { useSettingsStore } from '@/stores/settingsStore';

const SURFACE_DETAIL_OPTIONS: { value: SurfaceDetail; labelKey: string }[] = [
  { value: 'low', labelKey: 'settings.graphics.low' },
  { value: 'medium', labelKey: 'settings.graphics.medium' },
  { value: 'high', labelKey: 'settings.graphics.high' },
];

export function GraphicsSection() {
  const { t } = useTranslation();
  const graphics = useSettingsStore((s) => s.graphics);
  const updateGraphics = useSettingsStore((s) => s.updateGraphicsSettings);

  return (
    <div className="space-y-6">
      <div>
        <h3 className="flex items-center gap-2 text-lg font-semibold">
          <Monitor className="h-5 w-5" />
          {t('settings.graphics.title')}
        </h3>
        <p className="text-sm text-muted-foreground">{t('settings.graphics.description')}</p>
      </div>

      <Separator />

      {/* Surface Detail */}
      <Card>
        <CardContent className="space-y-3 pt-6">
          <div>
            <Label className="text-sm font-medium">
              {t('settings.graphics.surfaceDetail', 'Surface detail')}
            </Label>
            <p className="text-xs text-muted-foreground">
              {t(
                'settings.graphics.surfaceDetailDesc',
                'Curve smoothness for taxiway and pavement edges'
              )}
            </p>
          </div>
          <div className="flex gap-2">
            {SURFACE_DETAIL_OPTIONS.map(({ value, labelKey }) => (
              <Button
                key={value}
                variant={graphics.surfaceDetail === value ? 'default' : 'outline'}
                size="sm"
                className={cn('flex-1', graphics.surfaceDetail === value && 'pointer-events-none')}
                onClick={() => updateGraphics({ surfaceDetail: value })}
              >
                {t(labelKey)}
              </Button>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Toggles */}
      <Card>
        <CardContent className="space-y-4 pt-6">
          {/* Approach light animation */}
          <div className="flex items-center justify-between">
            <div>
              <Label className="text-sm font-medium">{t('settings.graphics.approachLights')}</Label>
              <p className="text-xs text-muted-foreground">
                {t('settings.graphics.approachLightsDesc')}
              </p>
            </div>
            <Switch
              checked={graphics.approachLightAnimation}
              onCheckedChange={(checked) => updateGraphics({ approachLightAnimation: checked })}
            />
          </div>

          <Separator />

          {/* Taxiway light glow */}
          <div className="flex items-center justify-between">
            <div>
              <Label className="text-sm font-medium">
                {t('settings.graphics.taxiwayGlow', 'Taxiway light glow')}
              </Label>
              <p className="text-xs text-muted-foreground">
                {t(
                  'settings.graphics.taxiwayGlowDesc',
                  'Multi-layer glow effect on taxiway lights'
                )}
              </p>
            </div>
            <Switch
              checked={graphics.taxiwayLightGlow}
              onCheckedChange={(checked) => updateGraphics({ taxiwayLightGlow: checked })}
            />
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
