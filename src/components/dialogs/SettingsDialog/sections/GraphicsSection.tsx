import { useTranslation } from 'react-i18next';
import { Monitor } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { Switch } from '@/components/ui/switch';
import { useSettingsStore } from '@/stores/settingsStore';

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

      <Card>
        <CardContent className="flex items-center justify-between pt-6">
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
        </CardContent>
      </Card>
    </div>
  );
}
