import type * as maplibregl from 'maplibre-gl';
import { describe, expect, it, vi } from 'vitest';
import { overlayClaimsClick } from './types';

function fakeMap(present: string[], hits: number) {
  const queryRenderedFeatures = vi.fn(() => new Array(hits).fill({}));
  const map = {
    getLayer: (id: string) => (present.includes(id) ? { id } : undefined),
    queryRenderedFeatures,
  } as unknown as maplibregl.Map;
  return { map, queryRenderedFeatures };
}

describe('overlayClaimsClick', () => {
  it('is false, without querying, when no clickable overlay is on the map', () => {
    const { map, queryRenderedFeatures } = fakeMap([], 0);
    expect(overlayClaimsClick(map, [1, 2])).toBe(false);
    expect(queryRenderedFeatures).not.toHaveBeenCalled();
  });
  it('queries only the overlay layers present and claims the click on a hit', () => {
    const { map, queryRenderedFeatures } = fakeMap(['vatsim-pilots', 'airports-hitbox'], 1);
    expect(overlayClaimsClick(map, [1, 2])).toBe(true);
    expect(queryRenderedFeatures).toHaveBeenCalledWith([1, 2], {
      layers: ['vatsim-pilots'],
      filter: ['!', ['get', 'onGround']],
    });
  });
  it('lets the click through when nothing sits at the point', () => {
    const { map } = fakeMap(['ivao-pilots'], 0);
    expect(overlayClaimsClick(map, [1, 2])).toBe(false);
  });
});
