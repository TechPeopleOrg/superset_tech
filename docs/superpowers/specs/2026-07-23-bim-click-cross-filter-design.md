# BIM viewer: click 3D → cross-filter (two-way)

**Date:** 2026-07-23
**Branch:** `feat/bim-viewer-chart`
**Plugin:** `superset-frontend/plugins/plugin-chart-bim`
**Depends on:** data-driven coloring (Plan 3, done 2026-07-22)

## Goal

Make the BIM 3D viewer an interactive cross-filter source for the dashboard.
Clicking a model element emits a Superset cross-filter on its `GlobalId`
(`link_column`), so the other charts on the dashboard filter to that element.
The relationship is two-way: an incoming filter on the same column highlights
the matching element back in the 3D scene. Today the data→3D link is one-way
(data colors the model); this closes the loop.

## Decisions (from brainstorming)

- **Filter field:** `link_column` (the same `GlobalId` field used for coloring).
  No separate cross-filter column control.
- **Selection model:** single-select. Click element X selects X; click the same
  X again, or click empty space, clears the filter.
- **In-scene feedback:** xeokit's native `entity.highlighted` (a separate layer
  that does not disturb the data coloring).
- **Enablement + direction:** an `Enable cross-filtering` control gates emitting
  the filter. Two-way sync is in scope from the start (incoming filter →
  highlight).

## Architecture & boundaries

All xeokit work stays behind the `api` facade in `useXeokitViewer`, mirroring the
coloring feature. This feature adds two facade methods plus thin wiring in
`BimChart` and `transformProps`. No xeokit logic leaks outside the hook, so a
future engine swap stays localized.

### `useXeokitViewer` — two new `api` methods

- **`onPick(cb: (globalId: string | null) => void): () => void`** — subscribes to
  element clicks. Internally uses `scene.input.on('mouseclicked', ...)` +
  `scene.pick`. A hit maps `pickResult.entity` → its `metaObject.id`, which is the
  bare `GlobalId` (because `globalizeObjectIds=false` by default; see coloring
  spec). A click on empty space (no pick hit) calls `cb(null)`. Returns an
  unsubscribe function.
- **`highlight(globalIds: string[]): void`** — clears any previous highlight, then
  sets `entity.highlighted = true` on the leaves of each `GlobalId` (reusing the
  existing `expandToLeaves`). An empty array clears all highlighting.

The pick subscription is torn down when the viewer is recreated (model change /
unmount), so handlers do not leak between models.

### `crossFilter.ts` — new pure module

Pure, engine-free helpers so the dataMask logic is unit-testable without xeokit:

- **`buildCrossFilterDataMask(linkColumn: string, globalId: string | null): DataMask`**
  - selection (`globalId` set):
    ```js
    {
      extraFormData: { filters: [{ col: linkColumn, op: 'IN', val: [globalId] }] },
      filterState: { value: [globalId], selectedValues: [globalId] },
    }
    ```
  - clear (`globalId === null`):
    ```js
    {
      extraFormData: { filters: [] },
      filterState: { value: null, selectedValues: null },
    }
    ```
- **`selectedGlobalIdsFromFilterState(filterState): string[]`** — reads
  `filterState.value` (Superset feeds our own emitted value back here) and returns
  a flat array of GlobalId strings for highlighting; `null`/empty → `[]`.

### `transformProps` additions

Pass through the standard Superset cross-filter plumbing already available on
`chartProps`:

- `setDataMask` (from `chartProps.hooks`)
- `emitCrossFilters` (from `chartProps`)
- `filterState` (from `chartProps`)

`linkColumn` is already derived for coloring and is reused as the filter column.

### `BimChart` wiring

- **Outgoing (click → filter):** subscribe via `api.onPick`. On a GlobalId,
  compute single-select intent (same id as current selection → clear; empty →
  clear; else select). When `emitCrossFilters` is true, call
  `setDataMask(buildCrossFilterDataMask(linkColumn, id))`. When it is false, do
  not call `setDataMask`.
- **Incoming (filter → highlight):** an effect keyed on the selection source
  calls `api.highlight(selectedIds)`.
  - When `emitCrossFilters` is **on**, the source of truth is `filterState`
    (`selectedGlobalIdsFromFilterState`). The click's own selection also arrives
    here because Superset round-trips the emitted value back into `filterState` —
    so click and external filter share one path and can never disagree.
  - When `emitCrossFilters` is **off**, `setDataMask` is not called, so the click
    never reaches `filterState`. To keep "selection is always visible", in this
    mode the highlight source is a **local** selection state instead. One effect,
    source switched by `emitCrossFilters`. This is the only place with two
    sources, and it is deliberate.

## Data flow

**Outgoing:**
```
click 3D element
  → scene.pick → metaObject.id (bare GlobalId)
  → api.onPick(cb) yields GlobalId (or null on empty space)
  → BimChart single-select intent (select / toggle-off / clear)
  → buildCrossFilterDataMask(linkColumn, id)
  → hooks.setDataMask(dataMask)   [only if emitCrossFilters]
  → Superset filters the other charts
```

**Incoming:**
```
filter on link_column (another chart/filter, OR this chart's own click
  round-tripped by Superset)
  → filterState.value arrives in transformProps
  → selectedGlobalIdsFromFilterState → [GlobalId...]
  → api.highlight(globalIds)   (empty/null → highlight([]) clears)
```

## Error handling & edge cases

- **Click misses geometry** (`scene.pick` → null): treated as clear. No crash.
- **Selected GlobalId absent from the query data:** highlight still applies (the
  element physically exists); the emitted filter yields empty results in other
  charts — expected, not an error.
- **`filterState.value` holds a GlobalId not in this model:** `expandToLeaves`
  returns empty, highlight is a no-op. Silent, no crash.
- **Pick handler teardown:** `onPick` returns an unsubscribe; `useXeokitViewer`
  removes the listener when the viewer is recreated (model change / unmount).
- **Model still loading (`!ready`):** clicks are not subscribed and highlight is
  not applied, exactly as with coloring. The highlight effect includes `ready` in
  its deps.

## Testing (TDD, unit-first)

1. **`crossFilter.ts`** (pure):
   - `buildCrossFilterDataMask` selection form is correct.
   - clear (`null`) → empty filters + null filterState.
   - `selectedGlobalIdsFromFilterState` extracts GlobalId array; null/empty → `[]`.
2. **`useXeokitViewer`** (mocked xeokit): `onPick` fires cb with the GlobalId on a
   hit; empty click → `null`; unsubscribe removes the listener.
3. **`BimChart`** (mocked `api`):
   - click on element calls `setDataMask` with the right mask when
     `emitCrossFilters=true`;
   - does **not** call it when `false`;
   - second click on the same element clears;
   - `filterState` drives `api.highlight` with the right leaves;
   - `!ready` does not highlight.
4. **Timing test (lesson from prior bug):** assert the sequence "api present,
   scene empty (`ready=false`) → highlight NOT called → `ready=true` → highlight
   called", so a mock that hands back a ready scene can't mask the "handle ready,
   data not yet populated" phase.

## Out of scope (later iterations)

- Multi-select (accumulating selection).
- Isolation / xray of non-selected elements (separate iteration).
- Numeric gradient coloring.
- Element property table from propertySets.
