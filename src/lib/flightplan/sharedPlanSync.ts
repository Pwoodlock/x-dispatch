import { type SharedPlanDoc, sameSnapshot } from './sharedPlan';

/** One half of the plan as a store exposes it: read it, overwrite it, hear it change. */
export interface SharedPlanSide<T extends object> {
  read(): T;
  apply(snapshot: T): void;
  subscribe(listener: () => void): () => void;
}

export interface SharedPlanApi {
  get(): Promise<SharedPlanDoc | null>;
  set(doc: SharedPlanDoc): void;
  onChanged(listener: (doc: SharedPlanDoc) => void): () => void;
}

export interface SharedPlanSyncOptions {
  /** This renderer's id, so its own pushes coming back are skipped. */
  origin: string;
  map: SharedPlanSide<SharedPlanDoc['map']>;
  draft: SharedPlanSide<SharedPlanDoc['draft']>;
  api: SharedPlanApi;
  /** Typing in the route field must not push on every key. */
  debounceMs?: number;
}

export interface SharedPlanSync {
  /** Takes main's plan, or seeds main with this one, then follows both stores. */
  start(): Promise<void>;
  /** After a reconnect: main may hold edits made meanwhile. */
  resync(): Promise<void>;
  stop(): void;
}

/**
 * Keeps this renderer's plan stores and main's shared copy the same. Local edits go up
 * after a short pause; edits from other devices come down as `plan:changed`. The last
 * edit wins, and a copy older than one already applied is left alone.
 */
export function createSharedPlanSync({
  origin,
  map,
  draft,
  api,
  debounceMs = 200,
}: SharedPlanSyncOptions): SharedPlanSync {
  let known = { map: map.read(), draft: draft.read() };
  let revision = 0;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let stopped = true;
  const unsubscribe: (() => void)[] = [];

  const push = () => {
    timer = null;
    known = { map: map.read(), draft: draft.read() };
    api.set({ revision: 0, origin, ...known });
  };

  const onLocalChange = () => {
    if (stopped) return;
    if (sameSnapshot(map.read(), known.map) && sameSnapshot(draft.read(), known.draft)) return;
    if (timer) clearTimeout(timer);
    timer = setTimeout(push, debounceMs);
  };

  const applyRemote = (doc: SharedPlanDoc) => {
    if (doc.revision <= revision) return;
    revision = doc.revision;
    if (doc.origin === origin) return;
    if (timer) clearTimeout(timer);
    timer = null;
    // Known first: the stores notify while applying, and that must not read as a local edit.
    const mapChanged = !sameSnapshot(doc.map, map.read());
    const draftChanged = !sameSnapshot(doc.draft, draft.read());
    known = { map: doc.map, draft: doc.draft };
    // Each half only when it differs, so the untouched one does not redraw.
    if (mapChanged) map.apply(doc.map);
    if (draftChanged) draft.apply(doc.draft);
  };

  const fetchLatest = async () => {
    // A restarted main numbers from 1 again; whatever it holds now is the plan.
    revision = 0;
    const doc = await api.get();
    if (stopped) return;
    if (doc) applyRemote(doc);
    else push();
  };

  return {
    async start() {
      stopped = false;
      unsubscribe.push(api.onChanged(applyRemote));
      await fetchLatest();
      if (stopped) return;
      unsubscribe.push(map.subscribe(onLocalChange), draft.subscribe(onLocalChange));
    },
    resync: fetchLatest,
    stop() {
      stopped = true;
      if (timer) clearTimeout(timer);
      timer = null;
      unsubscribe.splice(0).forEach((off) => off());
    },
  };
}
