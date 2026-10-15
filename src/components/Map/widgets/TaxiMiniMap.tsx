import { useEffect, useRef } from 'react';
import * as maplibregl from 'maplibre-gl';
import { LinearFeatureLayer } from '@/components/Map/layers/airport/LinearFeatureLayer';
import { PavementLayer } from '@/components/Map/layers/airport/PavementLayer';
import { RunwayLayer } from '@/components/Map/layers/airport/RunwayLayer';
import {
  addTaxiRouteLayer,
  bringTaxiRouteToFront,
  setTaxiRoute,
} from '@/components/Map/layers/dynamic/TaxiRouteLayer';
import { bearingDeg } from '@/lib/flightplan/builder/geometry';
import { AirportParser } from '@/lib/parsers/apt';
import type { GuidanceRoute } from '@/lib/taxiGuidance';
import { usePlaneStore } from '@/stores/planeStore';
import { useTaxiGuidanceStore } from '@/stores/taxiGuidanceStore';

// EXPERIMENT (exp/taxi-mini-map): a heading-up taxi map under the detached strip,
// Apple Maps navigation style. Throwaway until the look is settled.

const GLYPHS = 'https://tiles.openfreemap.org/fonts/{fontstack}/{range}.pbf';
const FOLLOW_ZOOM = 16.6;
const FOLLOW_PITCH = 50;
/** Aircraft sits this far down the map, so more of the taxi ahead shows. */
const AIRCRAFT_FROM_TOP = 0.62;
/** Camera moves smaller than this (degrees, about 1 m / 0.5°) are skipped. */
const MIN_MOVE_DEG = 0.00001;
const MIN_TURN_DEG = 0.5;

const EMPTY_STYLE: maplibregl.StyleSpecification = {
  version: 8,
  glyphs: GLYPHS,
  sources: {},
  layers: [{ id: 'mini-bg', type: 'background', paint: { 'background-color': 'rgba(0,0,0,0)' } }],
};

interface Pose {
  lon: number;
  lat: number;
  heading: number;
}

function aircraftElement(): HTMLElement {
  const el = document.createElement('div');
  el.innerHTML =
    '<svg width="26" height="26" viewBox="0 0 24 24" aria-hidden="true">' +
    '<path d="M12 2 L20 21 L12 16.5 L4 21 Z" fill="white" stroke="rgba(0,0,0,0.45)" stroke-width="1.2" stroke-linejoin="round"/>' +
    '</svg>';
  el.style.filter = 'drop-shadow(0 1px 3px rgba(0,0,0,0.5))';
  return el;
}

/** The route the strip follows: departure first, as the guidance row does. */
function activeRoute(): GuidanceRoute | null {
  const { departure, arrival } = useTaxiGuidanceStore.getState();
  return departure ?? arrival;
}

/** Live aircraft when X-Plane is running, else a ghost at the start of the route. */
function currentPose(route: GuidanceRoute | null): Pose | null {
  const state = usePlaneStore.getState().state;
  if (state) return { lon: state.longitude, lat: state.latitude, heading: state.heading };
  const [a, b] = route?.points ?? [];
  if (!a) return null;
  const heading = b
    ? bearingDeg({ latitude: a.lat, longitude: a.lon }, { latitude: b.lat, longitude: b.lon })
    : 0;
  return { lon: a.lon, lat: a.lat, heading };
}

export default function TaxiMiniMap() {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const map = new maplibregl.Map({
      container,
      style: EMPTY_STYLE,
      center: [0, 0],
      zoom: FOLLOW_ZOOM,
      pitch: FOLLOW_PITCH,
      minZoom: 13,
      maxZoom: 19,
      attributionControl: false,
      dragPan: false,
      dragRotate: false,
      touchZoomRotate: false,
      doubleClickZoom: false,
      keyboard: false,
      scrollZoom: { around: 'center' },
      fadeDuration: 0,
    });
    const marker = new maplibregl.Marker({
      element: aircraftElement(),
      rotationAlignment: 'viewport',
    })
      .setLngLat([0, 0])
      .addTo(map);

    let ready = false;
    let drawnIcao: string | null = null;
    let drawnRoute: GuidanceRoute | null = null;
    let lastPose: Pose | null = null;
    let frame = 0;

    // At most one camera move per frame, and none while the aircraft sits still.
    const follow = () => {
      frame = 0;
      if (!ready) return;
      const pose = currentPose(activeRoute());
      if (!pose) return;
      if (
        lastPose &&
        Math.abs(pose.lon - lastPose.lon) < MIN_MOVE_DEG &&
        Math.abs(pose.lat - lastPose.lat) < MIN_MOVE_DEG &&
        Math.abs(pose.heading - lastPose.heading) < MIN_TURN_DEG
      ) {
        return;
      }
      lastPose = pose;
      marker.setLngLat([pose.lon, pose.lat]);
      map.jumpTo({
        center: [pose.lon, pose.lat],
        bearing: pose.heading,
        padding: {
          top: container.clientHeight * AIRCRAFT_FROM_TOP * 0.9,
          bottom: 0,
          left: 0,
          right: 0,
        },
      });
    };
    const scheduleFollow = () => {
      if (!frame) frame = requestAnimationFrame(follow);
    };

    // The route's airport once per airport (pavement, runways, hold lines), then the route.
    const syncRoute = async () => {
      if (!ready) return;
      const route = activeRoute();
      if (route === drawnRoute) return;
      drawnRoute = route;
      if (!route) return;
      if (drawnIcao !== route.icao) {
        drawnIcao = route.icao;
        const result = await window.airportAPI.getAirportData(route.icao);
        if (!result || drawnRoute !== route) return;
        const { data: airport } = new AirportParser(result.data).parse();
        airport.longitude = route.points[0]?.lon ?? 0;
        airport.latitude = route.points[0]?.lat ?? 0;
        for (const layer of [new PavementLayer(), new RunwayLayer(), new LinearFeatureLayer()]) {
          if (layer.hasData(airport)) await layer.render(map, airport);
        }
      }
      setTaxiRoute(
        map,
        route.points.map((p) => ({ longitude: p.lon, latitude: p.lat }))
      );
      // The airport layers land above the route; keep the green path on top.
      bringTaxiRouteToFront(map);
      lastPose = null;
      scheduleFollow();
    };

    map.on('load', () => {
      // Only here is the style certain to be loaded: addTaxiRouteLayer quietly does
      // nothing while the airport layers are still loading.
      addTaxiRouteLayer(map);
      ready = true;
      void syncRoute();
      scheduleFollow();
    });
    const unsubscribePlane = usePlaneStore.subscribe(scheduleFollow);
    const unsubscribeRoute = useTaxiGuidanceStore.subscribe(() => void syncRoute());

    return () => {
      unsubscribePlane();
      unsubscribeRoute();
      if (frame) cancelAnimationFrame(frame);
      marker.remove();
      map.remove();
    };
  }, []);

  return <div ref={containerRef} className="h-full w-full" />;
}
