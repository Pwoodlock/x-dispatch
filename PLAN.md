# x-dispatch Map Layer Architecture Refactoring Plan

> ⚠️ **IMPORTANT**: All planning and knowledge files for this project are stored in:
> `C:\Users\Win-Dev\.pi\agent\knowledge\x-dispatch\`
>
> **DO NOT** commit planning documents to the project root (`D:\x-dispatch`). The project root contains only source code.

---

## Context

**Problem**: No central authority for layer ordering in MapLibre. Airport layers bury nav overlays (airspaces, navaids, ILS). Every subsystem independently calls `map.addLayer()`, `map.removeLayer()`, and `map.moveLayer()` with no coordination. The `bringNavLayersToTop()` hacks are unreliable and don't survive camera movements.

**Root Cause**: Airport render order is unpredictable. When a user selects an airport, `BaseLayerRenderer` subclasses add 14+ layers, pushing nav layers underground.

**Intended Outcome**: A `LayerManager` class that owns all layer ordering across 6 categories. No component calls MapLibre layer methods directly. All layer add/remove/visibility goes through `LayerManager`.

---

## Decisions Made

| Decision                                 | Choice        | Rationale                                                                                                                          |
| ---------------------------------------- | ------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| Phase 0 interim fixes (zoomend handlers) | **SKIP**      | Adding temporary code that will be removed adds churn. Go straight to LayerManager.                                                |
| Overlay anchoring in BaseLayerRenderer   | **SKIP**      | Same as above - LayerManager replaces this workaround.                                                                             |
| LayerManager + existing renderers        | **DELEGATE**  | LayerManager wraps MapLibre calls, existing singletons (`airspaceLayer`, etc.) continue to exist and do the actual layer creation. |
| Canvas overlays in LayerManager          | **EXCLUDE**   | Taxi route and approach lights use HTML canvas, not MapLibre layers. No ordering issues.                                           |
| Testing framework                        | **Vitest**    | Already in x-dispatch dev dependencies                                                                                             |
| Documentation tool                       | **Starlight** | 100% open source, local preview, GitHub-compatible                                                                                 |

---

## Layer Category Stack (authoritative order)

LayerManager enforces this order. Categories higher in the list render on top.

| Order      | Category  | Examples                                                                       |
| ---------- | --------- | ------------------------------------------------------------------------------ |
| 1 (bottom) | `base`    | map tiles, raster basemap                                                      |
| 2          | `terrain` | hillshade, DEM                                                                 |
| 3          | `airport` | runways, taxiways, gates, lights, signs                                        |
| 4          | `nav`     | airspaces, airways, navaids, ILS, holding patterns                             |
| 5          | `dynamic` | VATSIM, IVAO, flight plan, range rings, procedure route                        |
| 6 (top)    | `overlay` | canvas overlays (taxi route, approach lights) - **excluded from LayerManager** |

---

## Checkpoint Commands (run after each phase)

```bash
# Phase 1 checkpoint
git add -A && git commit -m "phase1: introduce LayerManager class" && git tag checkpoint/phase1-layer-manager-intro

# Phase 2 checkpoint
git add -A && git commit -m "phase2: migrate all hooks to LayerManager" && git tag checkpoint/phase2-all-hooks-migrated

# Phase 3 checkpoint
git add -A && git commit -m "phase3: remove bring-to-top hacks" && git tag checkpoint/phase3-hacks-removed

# Phase 4 checkpoint
git add -A && git commit -m "phase4: cleanup and finalize" && git tag checkpoint/phase4-cleanup-complete

# Phase 5 checkpoint
git add -A && git commit -m "phase5: add tests" && git tag checkpoint/phase5-tests-added

# Phase 6 checkpoint
git add -A && git commit -m "phase6: add developer documentation" && git tag checkpoint/phase6-docs-added

# Phase 7 checkpoint (merge)
git add -A && git commit -m "phase7: merge to main" && git tag checkpoint/phase7-merge-complete
```

### Rollback Commands

```bash
# View all checkpoints
git tag --list 'checkpoint/*'

# Rollback to a specific checkpoint (keeps local changes in working dir)
git reset --soft checkpoint/phase1-layer-manager-intro

# OR fully reset (loses uncommitted changes)
git reset --hard checkpoint/phase1-layer-manager-intro

# OR create a new branch from any checkpoint to test in isolation
git checkout -b test/phase1 checkpoint/phase1-layer-manager-intro
```

---

## Branch Strategy

```
upstream/main (clean reference)
       |
       v
origin/main (your fork's main)
       |
       v
refactor/simplify-map-layer-architecture  <-- working branch (CURRENT)
       |
       +-- [Phase 1] --> checkpoint/phase1-layer-manager-intro
       |
       +-- [Phase 2] --> checkpoint/phase2-all-hooks-migrated
       |
       +-- [Phase 3] --> checkpoint/phase3-hacks-removed
       |
       +-- [Phase 4] --> checkpoint/phase4-cleanup-complete
       |
       +-- [Phase 5] --> checkpoint/phase5-tests-added
       |
       +-- [Phase 6] --> checkpoint/phase6-docs-added
       |
       v
   Merge to origin/main (Phase 7)
```

---

## Phase 1: Introduce LayerManager

**Goal**: Create the LayerManager class with 6-category layer stack. No behavior change yet.

### Files to Create/Modify

| File                                          | Change                                      |
| --------------------------------------------- | ------------------------------------------- |
| `src/components/Map/layers/LayerManager.ts`   | **NEW** - authoritative layer manager class |
| `src/components/Map/index.tsx`                | Instantiate LayerManager, pass to children  |
| `src/components/Map/hooks/useNavLayerSync.ts` | Use LayerManager (proof-of-concept)         |

### Steps

- [ ] **1.1** Create `src/components/Map/layers/LayerManager.ts`

  ```typescript
  export type LayerCategory = 'base' | 'terrain' | 'airport' | 'nav' | 'dynamic' | 'overlay';

  export class LayerManager {
    private map: maplibregl.Map;
    private layersByCategory: Map<LayerCategory, Set<string>> = new Map();
    private categoryOrder: LayerCategory[] = [
      'base',
      'terrain',
      'airport',
      'nav',
      'dynamic',
      'overlay',
    ];

    constructor(map: maplibregl.Map) {
      this.map = map;
      this.categoryOrder.forEach((cat) => {
        this.layersByCategory.set(cat, new Set());
      });
    }

    addLayer(id: string, category: LayerCategory, spec: maplibregl.LayerSpecification): void {
      if (this.map.getLayer(id)) this.map.removeLayer(id);
      // Find first layer from categories that come AFTER ours
      const categoryIdx = this.categoryOrder.indexOf(category);
      const layersAbove =
        this.categoryOrder
          .slice(categoryIdx + 1)
          .flatMap((c) => [...(this.layersByCategory.get(c) ?? [])])
          .find((layerId) => this.map.getLayer(layerId)) ?? undefined;
      this.map.addLayer(spec, layersAbove);
      this.layersByCategory.get(category)!.add(id);
    }

    removeLayer(id: string): void {
      for (const set of this.layersByCategory.values()) {
        set.delete(id);
      }
      if (this.map.getLayer(id)) this.map.removeLayer(id);
    }

    bringToTop(id: string): void {
      const category = this.getCategoryOf(id);
      if (!category) return;
      const set = this.layersByCategory.get(category);
      if (set) {
        set.delete(id);
        set.add(id);
      }
      if (this.map.getLayer(id)) this.map.moveLayer(id);
    }

    getCategoryOf(id: string): LayerCategory | null {
      for (const [cat, set] of this.layersByCategory.entries()) {
        if (set.has(id)) return cat;
      }
      return null;
    }

    setVisibility(id: string, visible: boolean): void {
      if (this.map.getLayer(id)) {
        this.map.setLayoutProperty(id, 'visibility', visible ? 'visible' : 'none');
      }
    }
  }
  ```

- [ ] **1.2** Instantiate `LayerManager` in `src/components/Map/index.tsx`
- [ ] **1.3** Wire up `useNavLayerSync.ts` as proof-of-concept
- [ ] **1.4** Verify: no TypeScript errors, no lint errors, airspaces visible
- [ ] **1.5** Commit Phase 1

---

## Phase 2: Migrate all hooks to LayerManager

**Goal**: All hooks and layer files use LayerManager. No direct `map.addLayer()` calls.

### Files to Modify

| File                                                          | Category |
| ------------------------------------------------------------- | -------- |
| `src/components/Map/hooks/useAirportRenderer.ts`              | airport  |
| `src/components/Map/hooks/useVatsimSync.ts`                   | dynamic  |
| `src/components/Map/hooks/useIvaoSync.ts`                     | dynamic  |
| `src/components/Map/hooks/useRangeRingsSync.ts`               | dynamic  |
| `src/components/Map/hooks/useProcedureRouteSync.ts`           | dynamic  |
| `src/components/Map/hooks/useRouteLineSync.ts`                | dynamic  |
| `src/components/Map/layers/dynamic/FlightPlanLayer.ts`        | dynamic  |
| `src/components/Map/layers/dynamic/PlaneLayer.ts`             | dynamic  |
| `src/components/Map/layers/dynamic/RangeRingsLayer.ts`        | dynamic  |
| `src/components/Map/layers/dynamic/ProcedureRouteLayer.ts`    | dynamic  |
| `src/components/Map/layers/dynamic/VatsimLayer.ts`            | dynamic  |
| `src/components/Map/layers/dynamic/IvaoLayer.ts`              | dynamic  |
| `src/components/Map/layers/dynamic/RouteLineLayer.ts`         | dynamic  |
| `src/components/Map/layers/navigation/NavLayerRenderer.ts`    | nav      |
| `src/components/Map/layers/navigation/AirspaceLayer.ts`       | nav      |
| `src/components/Map/layers/navigation/ILSLayer.ts`            | nav      |
| `src/components/Map/layers/navigation/NavaidLayer.ts`         | nav      |
| `src/components/Map/layers/navigation/AirwayLayer.ts`         | nav      |
| `src/components/Map/layers/navigation/HoldingPatternLayer.ts` | nav      |

### Steps

- [ ] **2.1** Migrate airport hooks (`useAirportRenderer.ts`)
- [ ] **2.2** Migrate network hooks (`useVatsimSync.ts`, `useIvaoSync.ts`)
- [ ] **2.3** Migrate dynamic layer files
- [ ] **2.4** Migrate nav layer renderers
- [ ] **2.5** Verify no remaining direct `map.addLayer()` calls
- [ ] **2.6** Commit Phase 2

---

## Phase 3: Remove bring-to-top hacks

**Goal**: Delete unreliable hacks. LayerManager enforces ordering automatically.

### Files to Modify

| File                                               | Change                                                                                  |
| -------------------------------------------------- | --------------------------------------------------------------------------------------- |
| `src/components/Map/index.tsx`                     | Remove setTimeout bring-to-top calls                                                    |
| `src/components/Map/layers/index.ts`               | Remove `bringVatsimLayersToTop`, `bringIvaoLayersToTop`, `bringPlaneLayerToTop` exports |
| `src/components/Map/layers/dynamic/VatsimLayer.ts` | Remove `bringVatsimLayersToTop`                                                         |
| `src/components/Map/layers/dynamic/IvaoLayer.ts`   | Remove `bringIvaoLayersToTop`                                                           |
| `src/components/Map/layers/dynamic/PlaneLayer.ts`  | Remove `bringPlaneLayerToTop`                                                           |

### Steps

- [ ] **3.1** Remove `setTimeout(..., 100)` bring-to-top from `handleAirportClick` and `selectAirport`
- [ ] **3.2** Remove bring-to-top exports from `layers/index.ts`
- [ ] **3.3** Remove function implementations from VatsimLayer, IvaoLayer, PlaneLayer
- [ ] **3.4** Verify: airspaces remain visible WITHOUT bring-to-top hacks
- [ ] **3.5** Commit Phase 3

---

## Phase 4: Cleanup and finalization

**Goal**: Polish. Remove dead code. Update debug overlay.

### Files to Modify

| File                                                                | Change                                   |
| ------------------------------------------------------------------- | ---------------------------------------- |
| `src/components/Map/widgets/DevDebugOverlay/panels/LayersPanel.tsx` | Update to query LayerManager state       |
| `src/components/Map/layers/index.ts`                                | Clean up exports, re-export LayerManager |

### Steps

- [ ] **4.1** Update debug overlay to query LayerManager state
- [ ] **4.2** Clean up `layers/index.ts` exports
- [ ] **4.3** Run full verification checklist
- [ ] **4.4** Commit Phase 4

---

## Phase 5: Add Tests

**Goal**: Add unit and integration tests for LayerManager and key layer renderers.

### Why Testing is Easier After LayerManager

| Before                     | After (with LayerManager)            |
| -------------------------- | ------------------------------------ |
| Tight coupling to MapLibre | Mock/stub map object in tests        |
| Scattered ordering logic   | Test `LayerManager.addLayer()` once  |
| Complex hooks              | Simple unit tests for each component |
| Side effects everywhere    | Predictable state changes            |

### Files to Create

| File                                                           | Purpose                |
| -------------------------------------------------------------- | ---------------------- |
| `src/test/mocks/mapMock.ts`                                    | Reusable MapLibre mock |
| `src/components/Map/layers/__tests__/LayerManager.test.ts`     | Unit tests             |
| `src/components/Map/layers/__tests__/NavLayerRenderer.test.ts` | Unit tests             |
| `src/components/Map/hooks/__tests__/useNavLayerSync.test.ts`   | Integration tests      |

### Test Scenarios

| Scenario          | Type        | Description                |
| ----------------- | ----------- | -------------------------- |
| Layer ordering    | Unit        | Categories stack correctly |
| Layer removal     | Unit        | Tracking cleanup           |
| Visibility toggle | Unit        | Visibility changes         |
| Category lookup   | Unit        | getCategoryOf works        |
| Hook integration  | Integration | Hook uses LayerManager     |

### Steps

- [ ] **5.1** Create mock map utilities
- [ ] **5.2** Add LayerManager unit tests
- [ ] **5.3** Add NavLayerRenderer unit tests
- [ ] **5.4** Add integration tests for key hooks
- [ ] **5.5** Run tests: `npm run test`
- [ ] **5.6** Commit Phase 5

---

## Phase 6: Developer Documentation (Starlight)

**Goal**: Add developer documentation for local preview and GitHub-compatible deployment.

### Why Starlight

| Benefit                     | Explanation                                   |
| --------------------------- | --------------------------------------------- |
| **100% open source**        | Built on Astro, no vendor lock-in             |
| **Local preview**           | `npm run dev` - preview before committing     |
| **GitHub Pages compatible** | Deploy anywhere (Vercel, Netlify, Cloudflare) |
| **Beautiful default theme** | Professional docs out of box                  |
| **Search built-in**         | Pagefind works locally                        |
| **MDX support**             | React components in docs                      |

### Docs Structure

```
x-dispatch/
├── docs/                              # Starlight docs
│   ├── src/
│   │   ├── content/docs/
│   │   │   ├── index.mdx              # Landing page
│   │   │   ├── getting-started/
│   │   │   ├── architecture/
│   │   │   │   ├── map-layers.mdx     # LayerManager docs
│   │   │   │   └── layer-categories.mdx
│   │   │   ├── api/
│   │   │   │   └── layer-manager.mdx
│   │   │   └── contributing/
│   │   └── starlight.config.ts
│   └── package.json
└── src/
```

### Steps

- [ ] **6.1** Initialize Starlight: `npx create-starlight@latest`
- [ ] **6.2** Configure Starlight in `docs/src/starlight.config.ts`
- [ ] **6.3** Preview locally: `cd docs && npm run dev` (http://localhost:4321)
- [ ] **6.4** Create initial pages (index, map-layers, LayerManager API)
- [ ] **6.5** Add LayerManager documentation
- [ ] **6.6** Verify local preview works
- [ ] **6.7** Commit Phase 6

### Deployment Options (for later)

| Platform         | Method                   |
| ---------------- | ------------------------ |
| GitHub Pages     | Connect repo in settings |
| Vercel           | `vercel --prod`          |
| Netlify          | Drag dist folder         |
| Cloudflare Pages | Connect repo             |

---

## Phase 7: Merge to main

### Steps

- [ ] **7.1** Fetch upstream and merge `upstream/main`
- [ ] **7.2** Merge refactor branch into main
- [ ] **7.3** Resolve any conflicts (keep LayerManager version)
- [ ] **7.4** Push to origin

### Pre-Merge Checklist

- [ ] All phases complete
- [ ] All tests pass: `npm run test`
- [ ] All lint/typecheck pass
- [ ] Manual testing complete
- [ ] Docs build: `cd docs && npm run build`

---

## Summary

| Phase | Description                             | Checkpoint                              |
| ----- | --------------------------------------- | --------------------------------------- |
| 1     | Introduce LayerManager class            | `checkpoint/phase1-layer-manager-intro` |
| 2     | Migrate all hooks to use LayerManager   | `checkpoint/phase2-all-hooks-migrated`  |
| 3     | Remove bring-to-top hacks               | `checkpoint/phase3-hacks-removed`       |
| 4     | Cleanup and finalize                    | `checkpoint/phase4-cleanup-complete`    |
| 5     | Add unit and integration tests          | `checkpoint/phase5-tests-added`         |
| 6     | Add developer documentation (Starlight) | `checkpoint/phase6-docs-added`          |
| 7     | Merge to main                           | -                                       |

**Total**: 7 phases with checkpoint commits for safe rollback

---

## Debug Overlay Compatibility

**The debug overlay (LayersPanel) will NOT be affected by LayerManager.**

- LayerManager is an internal wrapper - it doesn't change how MapLibre stores layers
- Debug overlay reads from `map.getStyle().layers` and `map.getLayersOrder()` directly
- LayerManager tracking is internal only
- Optional enhancement in Phase 4: update debug overlay to show LayerManager's category tracking
