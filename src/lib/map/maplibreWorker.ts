import { setWorkerUrl } from 'maplibre-gl';
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url';

// maplibre-gl 6 derives its worker URL from import.meta.url and returns an
// empty string unless the origin is http(s). A packaged app loads the
// renderer over file://, so the empty URL resolves to index.html and the
// worker dies on the module MIME check, leaving the map blank. Point it at
// the bundled worker chunk instead. Since 6.13 the worker is self-contained;
// the former maplibre-gl-shared.mjs sibling is an empty deprecated stub.
setWorkerUrl(workerUrl);
