/**
 * X-Plane REST API Client (Main Process)
 *
 * This runs in Electron's main process to avoid CORS issues.
 * The renderer calls these via IPC through preload.
 *
 * Types are from the generated OpenAPI client at ./generated/xplaneApi.ts
 */
import { validateNewFlight } from '../launch/flightInit/schema';
import type { FlightInit } from './generated/xplaneApi';

const DEFAULT_PORT = 8086;
const CONNECTION_TIMEOUT = 2000;

interface ApiCapabilities {
  api: { versions: string[] };
  'x-plane': { version: string };
}

export interface StartFlightResult {
  success: boolean;
  error?: string;
  /** X-Plane's `error_code` when it refused the flight, e.g. `missing_ramp`. */
  code?: string;
}

/**
 * X-Plane answers a refused flight with `{ error_code, error_message }`. Keep
 * both: the code groups reports, the message is what the user gets to read.
 */
function rejectionFromBody(body: string, fallback: string): StartFlightResult {
  try {
    const parsed: unknown = JSON.parse(body);
    if (parsed && typeof parsed === 'object' && 'error_code' in parsed) {
      const { error_code, error_message } = parsed as {
        error_code: unknown;
        error_message?: unknown;
      };
      if (typeof error_code === 'string') {
        return {
          success: false,
          code: error_code,
          error: typeof error_message === 'string' ? error_message : fallback,
        };
      }
    }
  } catch {
    // Not JSON: an HTML error page or an empty body.
  }
  return { success: false, error: body || fallback };
}

export class XPlaneRestClient {
  private port: number;
  // Per X-Plane local web API docs: dataref id is stable within a session
  // (even across aircraft load/unload). Caching skips the name→id lookup
  // roundtrip on every setDataref/getDataref call after the first.
  private datarefIdCache = new Map<string, number>();

  constructor(port: number = DEFAULT_PORT) {
    this.port = port;
  }

  private get baseUrl(): string {
    return `http://localhost:${this.port}/api/v3`;
  }

  private async resolveDatarefId(name: string): Promise<number | null> {
    const cached = this.datarefIdCache.get(name);
    if (cached !== undefined) return cached;
    const response = await fetch(
      `${this.baseUrl}/datarefs?filter[name]=${encodeURIComponent(name)}&fields=id`,
      { method: 'GET', headers: { Accept: 'application/json' } }
    );
    if (!response.ok) return null;
    const body = await response.json();
    const id = body.data?.[0]?.id;
    if (typeof id !== 'number') return null;
    this.datarefIdCache.set(name, id);
    return id;
  }

  async isRunning(): Promise<boolean> {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), CONNECTION_TIMEOUT);

      const response = await fetch(`${this.baseUrl}/datarefs?limit=1`, {
        method: 'GET',
        headers: { Accept: 'application/json' },
        signal: controller.signal,
      });

      clearTimeout(timeoutId);
      return response.ok;
    } catch {
      return false;
    }
  }

  async getCapabilities(): Promise<ApiCapabilities | null> {
    try {
      const response = await fetch(`http://localhost:${this.port}/api/capabilities`, {
        method: 'GET',
        headers: { Accept: 'application/json' },
      });

      if (!response.ok) return null;
      return (await response.json()) as ApiCapabilities;
    } catch {
      return null;
    }
  }

  async startFlight(payload: FlightInit): Promise<StartFlightResult> {
    try {
      payload = validateNewFlight(payload);
      const response = await fetch(`${this.baseUrl}/flight`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify({ data: payload }),
      });

      if (!response.ok) {
        return rejectionFromBody(await response.text(), `HTTP ${response.status}`);
      }

      // Flight endpoints return a result code, unlike dataref endpoints.
      // HTTP success alone does not confirm that flight initialization succeeded.
      const result: unknown = await response.json();
      const code =
        result && typeof result === 'object' && 'error_code' in result
          ? result.error_code
          : undefined;
      if (code === 'success') return { success: true };
      if (typeof code === 'string') {
        return rejectionFromBody(JSON.stringify(result), `X-Plane rejected the flight: ${code}`);
      }
      return {
        success: false,
        error: 'X-Plane returned an invalid flight initialization response.',
      };
    } catch (err) {
      return { success: false, error: String(err) };
    }
  }

  async getDataref(datarefName: string): Promise<number | number[] | null> {
    try {
      const id = await this.resolveDatarefId(datarefName);
      if (id === null) return null;

      const valueResponse = await fetch(`${this.baseUrl}/datarefs/${id}/value`, {
        method: 'GET',
        headers: { Accept: 'application/json' },
      });

      if (!valueResponse.ok) return null;
      const valueData = await valueResponse.json();
      return valueData.data;
    } catch {
      return null;
    }
  }

  async setDataref(
    datarefName: string,
    value: number | number[]
  ): Promise<{ success: boolean; error?: string }> {
    try {
      const id = await this.resolveDatarefId(datarefName);
      if (id === null) return { success: false, error: 'Dataref not found' };

      const patchResponse = await fetch(`${this.baseUrl}/datarefs/${id}/value`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ data: value }),
      });

      if (!patchResponse.ok) {
        // A previously-cached id can go stale if the user restarts X-Plane
        // on the same port without us noticing; drop the cache so the next
        // attempt re-resolves it.
        this.datarefIdCache.delete(datarefName);
        const error = await patchResponse.text();
        return { success: false, error };
      }

      return { success: true };
    } catch (err) {
      return { success: false, error: String(err) };
    }
  }

  async activateCommand(
    commandName: string,
    duration: number = 0
  ): Promise<{ success: boolean; error?: string }> {
    try {
      // Find command ID by name
      const listResponse = await fetch(
        `${this.baseUrl}/commands?filter[name]=${encodeURIComponent(commandName)}&fields=id`,
        { method: 'GET', headers: { Accept: 'application/json' } }
      );

      if (!listResponse.ok) return { success: false, error: 'Command not found' };

      const listData = await listResponse.json();
      const id = listData.data?.[0]?.id;
      if (!id) return { success: false, error: 'Command not found' };

      // Activate
      const activateResponse = await fetch(`${this.baseUrl}/command/${id}/activate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ duration }),
      });

      if (!activateResponse.ok) {
        const error = await activateResponse.text();
        return { success: false, error };
      }

      return { success: true };
    } catch (err) {
      return { success: false, error: String(err) };
    }
  }

  getPort(): number {
    return this.port;
  }

  clearCache(): void {
    this.datarefIdCache.clear();
  }
}

let restClientInstance: XPlaneRestClient | null = null;

export function getRestClient(port?: number): XPlaneRestClient {
  if (!restClientInstance || (port !== undefined && restClientInstance.getPort() !== port)) {
    restClientInstance = new XPlaneRestClient(port);
  }
  return restClientInstance;
}
