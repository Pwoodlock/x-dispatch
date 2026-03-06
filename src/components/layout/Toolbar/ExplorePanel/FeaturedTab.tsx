import { useTranslation } from 'react-i18next';
import { MapPin } from 'lucide-react';
import { getFeaturedAirportsByCategory } from '@/components/layout/Toolbar/ExplorePanel/featured';
import { Button } from '@/components/ui/button';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import type { FeaturedCategory } from '@/types/featured';
import type { FeaturedTabProps } from './types';

const CATEGORIES: Array<FeaturedCategory | 'all'> = [
  'all',
  'challenging',
  'scenic',
  'unique',
  'historic',
];

const CATEGORY_ICONS: Record<FeaturedCategory, string> = {
  challenging: 'mountain',
  scenic: 'sunrise',
  unique: 'sparkles',
  historic: 'landmark',
};

export function FeaturedTab({ category, onCategoryChange, onSelectAirport }: FeaturedTabProps) {
  const { t } = useTranslation();
  const airports = getFeaturedAirportsByCategory(category);

  return (
    <div className="space-y-4">
      <ToggleGroup
        type="single"
        value={category}
        onValueChange={(v) => {
          if (v) onCategoryChange(v as FeaturedCategory | 'all');
        }}
        className="flex flex-wrap gap-2"
      >
        {CATEGORIES.map((cat) => (
          <ToggleGroupItem key={cat} value={cat} className="h-auto rounded-full px-3 py-1 text-sm">
            {cat === 'all' ? t('explore.featured.all') : t(`explore.featured.${cat}`)}
          </ToggleGroupItem>
        ))}
      </ToggleGroup>

      <div className="grid gap-2">
        {airports.map((airport) => (
          <Button
            key={airport.icao}
            variant="ghost"
            onClick={() => onSelectAirport(airport.icao)}
            className="h-auto w-full items-start gap-3 border border-border bg-background p-3 text-left hover:bg-muted"
          >
            <span className="text-lg">
              {t(`explore.featured.icons.${CATEGORY_ICONS[airport.category]}`)}
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <span className="font-mono text-sm font-medium">{airport.icao}</span>
                <span className="truncate text-sm text-muted-foreground">{airport.tagline}</span>
              </div>
              <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">
                {airport.description}
              </p>
            </div>
            <MapPin className="h-4 w-4 flex-shrink-0 text-muted-foreground" />
          </Button>
        ))}
      </div>
    </div>
  );
}
