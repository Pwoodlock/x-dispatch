import { app } from 'electron';
import logger from '@/lib/utils/logger';

const DEFAULT_TIMEOUT_MS = 15_000;

function createSignal(timeoutMs: number): AbortSignal {
  const controller = new AbortController();
  setTimeout(() => controller.abort(), timeoutMs).unref?.();
  return controller.signal;
}

async function fetchText(url: string, init: RequestInit = {}): Promise<string> {
  const response = await fetch(url, {
    ...init,
    headers: {
      'User-Agent': `X-Dispatch/${app.getVersion()}`,
      ...(init.headers ?? {}),
    },
    signal: createSignal(DEFAULT_TIMEOUT_MS),
  });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status} for ${url}`);
  }

  return response.text();
}

async function fetchJson<T>(url: string, init: RequestInit = {}): Promise<T> {
  return JSON.parse(await fetchText(url, init)) as T;
}

export async function downloadVatspyBundle(): Promise<{
  version: string;
  dat: string;
  boundaries: string;
}> {
  logger.main.info('Downloading VATSpy sector bundle');

  const mapData = await fetchJson<{
    current_commit_hash: string;
    vatspy_dat_url: string;
    fir_boundaries_geojson_url: string;
  }>('https://api.vatsim.net/api/map_data/');

  const [dat, boundaries] = await Promise.all([
    fetchText(mapData.vatspy_dat_url),
    fetchText(mapData.fir_boundaries_geojson_url),
  ]);

  return {
    version: mapData.current_commit_hash,
    dat,
    boundaries,
  };
}

export async function downloadSimawareBundle(): Promise<{
  version: string;
  rawText: string;
}> {
  // The releases/latest/download redirect is not subject to the GitHub API's
  // unauthenticated rate limit, and its Location header carries the tag.
  const latestUrl =
    'https://github.com/vatsimnetwork/simaware-tracon-project/releases/latest/download/TRACONBoundaries.geojson';
  const redirect = await fetch(latestUrl, {
    headers: { 'User-Agent': `X-Dispatch/${app.getVersion()}` },
    redirect: 'manual',
    signal: createSignal(DEFAULT_TIMEOUT_MS),
  });
  const assetUrl = redirect.headers.get('location');
  if (!assetUrl) {
    throw new Error(`HTTP ${redirect.status} for ${latestUrl}`);
  }

  const tag = assetUrl.match(/\/releases\/download\/([^/]+)\//)?.[1];
  const version = tag ? decodeURIComponent(tag) : 'unknown';
  logger.main.info(`Downloading SimAware TRACON ${version}`);

  return {
    version,
    rawText: await fetchText(assetUrl),
  };
}
