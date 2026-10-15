import { type CSSProperties, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Lock, LockOpen, Map as MapIcon, X } from 'lucide-react';
import { toast } from 'sonner';
import FlightStrip from '@/components/Map/widgets/FlightStrip';
import TaxiMiniMap from '@/components/Map/widgets/TaxiMiniMap';
import { Button } from '@/components/ui/button';
import { useFlightStripGuidance } from '@/hooks/useFlightStripGuidance';
import { useSettingsStorageSync } from '@/hooks/useSettingsStorageSync';
import { aspectChanged } from '@/lib/flightStrip/windowFit';
import { cn } from '@/lib/utils/helpers';
import { useFlightStripWindowOptions } from '@/queries';
import { usePlaneStateStream } from '@/queries/useXPlaneWebSocket';
import { usePlaneStore } from '@/stores/planeStore';
import { useTaxiGuidanceStore } from '@/stores/taxiGuidanceStore';

const dragStyle = { WebkitAppRegion: 'drag' } as CSSProperties;
const noDragStyle = { WebkitAppRegion: 'no-drag' } as CSSProperties;

/** The scale that fits the content inside the frame, recomputed when either resizes. */
function useFitScale(
  frameRef: React.RefObject<HTMLDivElement | null>,
  contentRef: React.RefObject<HTMLDivElement | null>
) {
  const [scale, setScale] = useState(1);
  useLayoutEffect(() => {
    const frame = frameRef.current;
    const content = contentRef.current;
    if (!frame || !content) return;
    const update = () => {
      // offsetWidth ignores the transform, so this is the strip's own size.
      const { offsetWidth: w, offsetHeight: h } = content;
      if (!w || !h) return;
      setScale(Math.min(frame.clientWidth / w, frame.clientHeight / h));
    };
    const observer = new ResizeObserver(update);
    observer.observe(frame);
    observer.observe(content);
    update();
    return () => observer.disconnect();
  }, [frameRef, contentRef]);
  return scale;
}

/** Padding around the strip (`p-1` on both sides), part of the window's shape. */
const FRAME_PADDING_PX = 8;

/**
 * Tells main the strip's natural size whenever its shape changes (a readout turned
 * on or off), so the window keeps the strip's proportions instead of showing bars.
 */
function useReportStripShape(contentRef: React.RefObject<HTMLDivElement | null>) {
  useEffect(() => {
    const content = contentRef.current;
    if (!content) return;
    let reported: number | null = null;
    const report = () => {
      const width = content.offsetWidth + FRAME_PADDING_PX;
      const height = content.offsetHeight + FRAME_PADDING_PX;
      if (width <= FRAME_PADDING_PX || height <= FRAME_PADDING_PX) return;
      const ratio = width / height;
      if (!aspectChanged(reported, ratio)) return;
      reported = ratio;
      window.appAPI.setFlightStripContentSize({ width, height });
    };
    const observer = new ResizeObserver(report);
    observer.observe(content);
    report();
    return () => observer.disconnect();
  }, [contentRef]);
}

/**
 * Tells main where the strip's buttons are whenever they move or resize (window resize,
 * Interface Zoom, the strip's scale), so main can watch the cursor over them. The rect
 * goes in screen pixels: Interface Zoom scales CSS pixels.
 */
function useReportGrip(gripRef: React.RefObject<HTMLDivElement | null>, scale: number) {
  useEffect(() => {
    const grip = gripRef.current;
    if (!grip) return;
    const report = () => {
      const zoom = window.outerWidth / window.innerWidth || 1;
      const { x, y, width, height } = grip.getBoundingClientRect();
      window.appAPI.setFlightStripGrip({
        x: x * zoom,
        y: y * zoom,
        width: width * zoom,
        height: height * zoom,
      });
    };
    const observer = new ResizeObserver(report);
    observer.observe(grip);
    observer.observe(document.documentElement);
    window.addEventListener('resize', report);
    report();
    return () => {
      observer.disconnect();
      window.removeEventListener('resize', report);
    };
  }, [gripRef, scale]);
}

/**
 * The whole renderer of the detached flight strip window. The window has no title bar:
 * unlocked, the strip area drags it, the edges resize it and the strip scales to fit.
 * Locked, main lets every click through to the simulator; main watches the cursor and
 * lets the strip's buttons alone take clicks.
 */
export function FlightStripWindow() {
  usePlaneStateStream();
  useSettingsStorageSync();
  useFlightStripGuidance();
  const { t } = useTranslation();
  const { locked } = useFlightStripWindowOptions();
  const frameRef = useRef<HTMLDivElement>(null);
  const stripRef = useRef<HTMLDivElement>(null);
  const gripRef = useRef<HTMLDivElement>(null);
  // EXPERIMENT (exp/taxi-mini-map): the taxi map panel under the strip.
  const [taxiMap, setTaxiMap] = useState(false);
  const airborne = usePlaneStore((s) => s.state?.onGround === false);
  const hasRoute = useTaxiGuidanceStore((s) => !!(s.departure ?? s.arrival));
  const toggleTaxiMap = () => {
    if (!taxiMap && !hasRoute) {
      toast.info(t('flightStrip.taxiMapNoRoute'));
      return;
    }
    setTaxiMap((open) => !open);
  };
  const scale = useFitScale(frameRef, stripRef);
  useReportStripShape(stripRef);
  useReportGrip(gripRef, scale);

  return (
    // The padding stays outside the drag region so the window edges keep resizing.
    <div className="bg-background relative h-screen w-screen overflow-hidden p-1">
      <div
        ref={frameRef}
        className="flex h-full w-full items-center justify-center overflow-hidden"
        style={locked ? undefined : dragStyle}
      >
        <div
          ref={stripRef}
          className="shrink-0"
          style={{ transform: `scale(${scale})`, transformOrigin: 'center' }}
        >
          <FlightStrip
            detached
            onCenterPlane={() => {}}
            actions={
              <div ref={gripRef} className="flex flex-col" style={noDragStyle}>
                <Button
                  variant="ghost"
                  size="icon-xs"
                  className="text-muted-foreground h-5 w-5"
                  onClick={() => window.close()}
                  aria-label={t('common.close')}
                  tooltip={t('common.close')}
                >
                  <X className="h-3 w-3" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon-xs"
                  className={cn('h-5 w-5', locked ? 'text-primary' : 'text-muted-foreground')}
                  // A locked window can miss the first click, so pilots double-click; the
                  // second click of a double-click would lock it again.
                  onClick={(event) => {
                    if (event.detail > 1) return;
                    window.appAPI.toggleFlightStripLock();
                  }}
                  aria-pressed={locked}
                  aria-label={locked ? t('flightStrip.unlock') : t('flightStrip.lock')}
                  tooltip={locked ? t('flightStrip.unlock') : t('flightStrip.lock')}
                >
                  {locked ? <Lock className="h-3 w-3" /> : <LockOpen className="h-3 w-3" />}
                </Button>
                <Button
                  variant="ghost"
                  size="icon-xs"
                  className={cn('h-5 w-5', taxiMap ? 'text-primary' : 'text-muted-foreground')}
                  onClick={toggleTaxiMap}
                  aria-pressed={taxiMap}
                  aria-label={t('flightStrip.taxiMap')}
                  tooltip={t('flightStrip.taxiMap')}
                >
                  <MapIcon className="h-3 w-3" />
                </Button>
              </div>
            }
            footer={
              taxiMap &&
              !airborne && (
                <div
                  className="border-border/50 h-56 w-0 min-w-full overflow-hidden rounded-b-xl border-t"
                  style={noDragStyle}
                >
                  <TaxiMiniMap scale={scale} />
                </div>
              )
            }
          />
        </div>
      </div>
    </div>
  );
}
