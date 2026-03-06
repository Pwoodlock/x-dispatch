import { useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import type { Airport } from '@/lib/xplaneServices/dataService';
import { useMapStore } from '@/stores/mapStore';
import { FeaturedTab } from './FeaturedTab';
import { RoutesTab } from './RoutesTab';
import { VatsimEventsTab } from './VatsimEventsTab';

const TABS = ['featured', 'routes', 'vatsim'] as const;

interface ExplorePanelProps {
  airports: Airport[];
  onSelectAirport: (airport: Airport) => void;
}

export function ExplorePanel({ airports, onSelectAirport }: ExplorePanelProps) {
  const { t } = useTranslation();
  const explore = useMapStore((s) => s.explore);
  const setExploreTab = useMapStore((s) => s.setExploreTab);
  const setExploreOpen = useMapStore((s) => s.setExploreOpen);
  const setFeaturedCategory = useMapStore((s) => s.setFeaturedCategory);
  const setSelectedRoute = useMapStore((s) => s.setSelectedRoute);

  const handleSelectAirport = useCallback(
    (icao: string) => {
      const airport = airports.find((a) => a.icao === icao);
      if (airport) {
        onSelectAirport(airport);
        setExploreOpen(false);
      }
    },
    [airports, onSelectAirport, setExploreOpen]
  );

  if (!explore.isOpen) return null;

  return (
    <div
      id="explore-panel"
      className="absolute left-4 top-28 z-10 w-[340px] rounded-lg border border-border bg-card"
    >
      <Tabs
        value={explore.activeTab}
        onValueChange={(v) => setExploreTab(v as (typeof TABS)[number])}
      >
        <TabsList variant="line">
          {TABS.map((tab) => (
            <TabsTrigger key={tab} value={tab} className="flex-1 text-xs uppercase tracking-wide">
              {t(`explore.tabs.${tab}`)}
            </TabsTrigger>
          ))}
        </TabsList>

        <div className="max-h-96 overflow-y-auto overflow-x-hidden p-4">
          <TabsContent value="featured" className="mt-0">
            <FeaturedTab
              category={explore.featuredCategory}
              onCategoryChange={setFeaturedCategory}
              onSelectAirport={handleSelectAirport}
            />
          </TabsContent>
          <TabsContent value="routes" className="mt-0">
            <RoutesTab selectedRoute={explore.selectedRoute} onSelectRoute={setSelectedRoute} />
          </TabsContent>
          <TabsContent value="vatsim" className="mt-0">
            <VatsimEventsTab onSelectAirport={handleSelectAirport} />
          </TabsContent>
        </div>
      </Tabs>
    </div>
  );
}
