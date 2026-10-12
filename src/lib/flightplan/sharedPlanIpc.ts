import { type SharedPlanDoc, isSharedPlanDoc } from './sharedPlan';

/** The slice of the handler registry this needs, so tests can pass fakes. */
export interface SharedPlanRegistry {
  handle(channel: string, fn: (event: unknown, ...args: unknown[]) => unknown): void;
  on(channel: string, fn: (event: unknown, ...args: unknown[]) => void): void;
  broadcast(channel: string, ...args: unknown[]): void;
}

/**
 * Main keeps the latest flight plan any device pushed and relays it to every
 * window and tablet. A new renderer asks for it with `plan:get`.
 */
export function registerSharedPlanIpc({ handle, on, broadcast }: SharedPlanRegistry): void {
  let current: SharedPlanDoc | null = null;
  let revision = 0;

  handle('plan:get', () => current);
  on('plan:set', (_event, doc: unknown) => {
    if (!isSharedPlanDoc(doc)) return;
    current = { ...doc, revision: ++revision };
    broadcast('plan:changed', current);
  });
}
