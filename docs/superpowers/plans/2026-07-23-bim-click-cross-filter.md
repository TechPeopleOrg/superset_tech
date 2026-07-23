# BIM click → cross-filter (two-way) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the BIM 3D viewer emit a Superset cross-filter on a clicked element's `GlobalId`, and highlight the matching element back when a filter on that column arrives.

**Architecture:** All xeokit access stays behind the `XeokitApi` facade in `useXeokitViewer` (two new methods: `onPick`, `highlight`). A pure `crossFilter.ts` module builds the Superset `DataMask` and reads the incoming `filterState`. `transformProps` passes through `setDataMask`/`emitCrossFilters`/`filterState`; `BimChart` wires click→filter (outgoing) and filterState→highlight (incoming).

**Tech Stack:** TypeScript, React (hooks), xeokit-sdk, `@superset-ui/core` (`DataMask`), Jest + React Testing Library.

## Global Constraints

- ASF license header on every new source file (copy from any existing `src/*.ts` in the plugin).
- No `any` types; reuse existing types. Functional components with hooks.
- Run `npx prettier --write` on changed files before each commit; keep eslint clean (ignore only the pre-existing missing-rule-definition errors `file-progress/activate` and `react-you-might-not-need-an-effect/no-empty-effect`, which are environment noise unrelated to these changes).
- Filter column is `linkColumn` (the same GlobalId field used for coloring). Single-select: click same element or empty space clears.
- Highlight/pick must be gated by `ready` — never touch the scene before the `'loaded'` event (scene is empty until then).
- Working directory for all commands: `superset-frontend/`. Tests run with `npx jest plugins/plugin-chart-bim/...`.
- All commits on branch `feat/bim-viewer-chart`. No `Co-Authored-By` trailer.

---

### Task 1: `crossFilter.ts` — pure DataMask helpers

**Files:**
- Create: `superset-frontend/plugins/plugin-chart-bim/src/crossFilter.ts`
- Test: `superset-frontend/plugins/plugin-chart-bim/test/crossFilter.test.ts`

**Interfaces:**
- Consumes: `DataMask` type from `@superset-ui/core`.
- Produces:
  - `buildCrossFilterDataMask(linkColumn: string, globalId: string | null): DataMask`
  - `selectedGlobalIdsFromFilterState(filterState: { value?: unknown } | undefined): string[]`

- [ ] **Step 1: Write the failing test**

```ts
/**
 * Licensed to the Apache Software Foundation (ASF) under one
 * or more contributor license agreements.  See the NOTICE file
 * distributed with this work for additional information
 * regarding copyright ownership.  The ASF licenses this file
 * to you under the Apache License, Version 2.0 (the
 * "License"); you may not use this file except in compliance
 * with the License.  You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing,
 * software distributed under the License is distributed on an
 * "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY
 * KIND, either express or implied.  See the License for the
 * specific language governing permissions and limitations
 * under the License.
 */
import {
  buildCrossFilterDataMask,
  selectedGlobalIdsFromFilterState,
} from '../src/crossFilter';

test('buildCrossFilterDataMask builds an IN filter for a selection', () => {
  const mask = buildCrossFilterDataMask('GlobalId', 'gid-1');
  expect(mask.extraFormData).toEqual({
    filters: [{ col: 'GlobalId', op: 'IN', val: ['gid-1'] }],
  });
  expect(mask.filterState).toEqual({
    value: ['gid-1'],
    selectedValues: ['gid-1'],
  });
});

test('buildCrossFilterDataMask clears the filter when globalId is null', () => {
  const mask = buildCrossFilterDataMask('GlobalId', null);
  expect(mask.extraFormData).toEqual({ filters: [] });
  expect(mask.filterState).toEqual({ value: null, selectedValues: null });
});

test('selectedGlobalIdsFromFilterState reads value into a flat string array', () => {
  expect(selectedGlobalIdsFromFilterState({ value: ['a', 'b'] })).toEqual([
    'a',
    'b',
  ]);
});

test('selectedGlobalIdsFromFilterState handles nested arrays (echarts shape)', () => {
  // Superset may round-trip filterState.value as an array of tuples.
  expect(selectedGlobalIdsFromFilterState({ value: [['a'], ['b']] })).toEqual([
    'a',
    'b',
  ]);
});

test('selectedGlobalIdsFromFilterState returns [] for null/empty/undefined', () => {
  expect(selectedGlobalIdsFromFilterState(undefined)).toEqual([]);
  expect(selectedGlobalIdsFromFilterState({ value: null })).toEqual([]);
  expect(selectedGlobalIdsFromFilterState({ value: [] })).toEqual([]);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest plugins/plugin-chart-bim/test/crossFilter.test.ts`
Expected: FAIL — cannot find module `../src/crossFilter`.

- [ ] **Step 3: Write minimal implementation**

```ts
/**
 * Licensed to the Apache Software Foundation (ASF) under one
 * or more contributor license agreements.  See the NOTICE file
 * distributed with this work for additional information
 * regarding copyright ownership.  The ASF licenses this file
 * to you under the Apache License, Version 2.0 (the
 * "License"); you may not use this file except in compliance
 * with the License.  You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing,
 * software distributed under the License is distributed on an
 * "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY
 * KIND, either express or implied.  See the License for the
 * specific language governing permissions and limitations
 * under the License.
 */
import { DataMask } from '@superset-ui/core';

// Build a Superset cross-filter DataMask for a single selected element, or a
// cleared mask when globalId is null. The filter column is the same GlobalId
// column the chart links/colors by.
export function buildCrossFilterDataMask(
  linkColumn: string,
  globalId: string | null,
): DataMask {
  if (globalId === null) {
    return {
      extraFormData: { filters: [] },
      filterState: { value: null, selectedValues: null },
    };
  }
  return {
    extraFormData: {
      filters: [{ col: linkColumn, op: 'IN', val: [globalId] }],
    },
    filterState: { value: [globalId], selectedValues: [globalId] },
  };
}

// Read the incoming filterState (our own emitted value, round-tripped by
// Superset, or an external filter on the same column) into a flat array of
// GlobalId strings for highlighting. Tolerates flat arrays and arrays of
// single-element tuples; null/empty yields [].
export function selectedGlobalIdsFromFilterState(
  filterState: { value?: unknown } | undefined,
): string[] {
  const value = filterState?.value;
  if (!Array.isArray(value)) return [];
  return value
    .map(v => (Array.isArray(v) ? v[0] : v))
    .filter((v): v is string | number => v !== null && v !== undefined)
    .map(String);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest plugins/plugin-chart-bim/test/crossFilter.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
npx prettier --write plugins/plugin-chart-bim/src/crossFilter.ts plugins/plugin-chart-bim/test/crossFilter.test.ts
git add plugins/plugin-chart-bim/src/crossFilter.ts plugins/plugin-chart-bim/test/crossFilter.test.ts
git commit -m "feat(bim): pure cross-filter DataMask helpers"
```

---

### Task 2: `XeokitApi.onPick` and `XeokitApi.highlight`

**Files:**
- Modify: `superset-frontend/plugins/plugin-chart-bim/src/types.ts` (add two methods to `XeokitApi`, ~line 114)
- Modify: `superset-frontend/plugins/plugin-chart-bim/src/useXeokitViewer.ts` (implement them in the `api` object; add teardown)
- Test: `superset-frontend/plugins/plugin-chart-bim/test/useXeokitViewer.test.ts` (existing) — add cases

**Interfaces:**
- Consumes: existing `scene.objects`, `expandToLeaves` from `useXeokitViewer`; `viewer.scene.input`, `viewer.scene.pick` from xeokit.
- Produces (added to `XeokitApi`):
  - `onPick(cb: (globalId: string | null) => void): () => void`
  - `highlight(objectIds: string[]): void`

- [ ] **Step 1: Read the existing test file to match its mock style**

Run: `sed -n '1,120p' plugins/plugin-chart-bim/test/useXeokitViewer.test.ts`
Note how the xeokit dynamic import is mocked and how `scene.objects` is shaped. Reuse that mock; do not invent a new one.

- [ ] **Step 2: Write the failing test**

Add these tests to `plugins/plugin-chart-bim/test/useXeokitViewer.test.ts`. The mock's `scene` object must gain an `input` with an `on` recorder and a `pick` function, and each object in `scene.objects` must accept a `highlighted` boolean. Adapt the variable names to the file's existing mock; the assertions are:

```ts
test('api.onPick fires the callback with the picked metaObject id', () => {
  // Arrange the mock so scene.input.on('mouseclicked', handler) stores handler,
  // and scene.pick(...) returns { entity: { metaObject: { id: 'gid-1' } } }.
  // After the model 'loaded' event, call api.onPick(cb), then invoke the stored
  // mouseclicked handler with a canvas coordinate.
  // Assert cb was called with 'gid-1'.
});

test('api.onPick fires the callback with null when the click hits nothing', () => {
  // scene.pick(...) returns undefined. Invoke the stored mouseclicked handler.
  // Assert cb was called with null.
});

test('api.onPick returns an unsubscribe that removes the listener', () => {
  // scene.input.off must be called (or the recorded handler cleared) when the
  // returned function is invoked. Assert the handler no longer fires cb.
});

test('api.highlight sets highlighted on leaves and clears previous highlight', () => {
  // Given scene.objects has 'leaf-1','leaf-2' and expandToLeaves('gid') -> ['leaf-1'].
  // api.highlight(['gid']) sets scene.objects['leaf-1'].highlighted === true.
  // Then api.highlight([]) sets scene.objects['leaf-1'].highlighted === false.
});
```

Concrete mock shape to add to the existing `scene` mock object:

```ts
// inside the mocked scene:
const pickHandlers: Array<(coords: unknown) => void> = [];
scene.input = {
  on: (event: string, cb: (coords: unknown) => void) => {
    if (event === 'mouseclicked') pickHandlers.push(cb);
    return pickHandlers.length - 1; // xeokit returns a subscription id
  },
  off: (id: number) => {
    pickHandlers[id] = () => {};
  },
};
scene.pick = jest.fn(); // tests set mockReturnValue per case
// objects gain `highlighted`; extend the object factory to include it:
//   { visible: true, colorize: [1,1,1], highlighted: false }
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npx jest plugins/plugin-chart-bim/test/useXeokitViewer.test.ts`
Expected: FAIL — `api.onPick`/`api.highlight` is not a function.

- [ ] **Step 4: Add the two methods to the `XeokitApi` interface**

In `plugins/plugin-chart-bim/src/types.ts`, inside `interface XeokitApi`, after `allObjectIds(): string[];`:

```ts
  // Subscribe to element clicks. The callback receives the picked element's
  // bare GlobalId (metaObject id), or null when the click hits empty space.
  // Returns an unsubscribe function that removes the listener.
  onPick(cb: (globalId: string | null) => void): () => void;
  // Highlight exactly the given objects (expanded to their geometry leaves),
  // clearing any previous highlight first. An empty array clears all.
  highlight(objectIds: string[]): void;
```

- [ ] **Step 5: Implement in `useXeokitViewer.ts`**

Widen the `scene` type cast (around line 102-106) so it includes `input`, `pick`, and `highlighted` on objects:

```ts
const scene = viewer.scene as unknown as {
  objects: Record<
    string,
    { visible: boolean; colorize: number[]; highlighted: boolean }
  >;
  input: {
    on: (event: string, cb: (coords: unknown) => void) => number;
    off: (id: number) => void;
  };
  pick: (params: { canvasPos: unknown }) => {
    entity?: { metaObject?: { id?: string } };
  } | null;
  getObjectIDsInSubtree: (id: string) => string[];
};
```

Add, alongside the existing api methods (after `allObjectIds`), a module-level
`const highlighted = new Set<string>();` inside the effect scope, then:

```ts
  onPick: cb => {
    const subId = scene.input.on('mouseclicked', (coords: unknown) => {
      const hit = scene.pick({ canvasPos: coords });
      const gid = hit?.entity?.metaObject?.id;
      cb(gid ?? null);
    });
    return () => scene.input.off(subId);
  },
  highlight: objectIds => {
    // Clear previous highlight.
    highlighted.forEach(id => {
      const obj = scene.objects[id];
      if (obj) obj.highlighted = false;
    });
    highlighted.clear();
    // Apply new highlight on the geometry leaves of each id.
    objectIds.forEach(gid => {
      api.expandToLeaves(gid).forEach(leaf => {
        const obj = scene.objects[leaf];
        if (obj) {
          obj.highlighted = true;
          highlighted.add(leaf);
        }
      });
    });
  },
```

(`api` is referenced inside `highlight`; it already exists as the const the
other methods are defined on — this mirrors how existing methods call
`scene`/each other. If the linter flags use-before-assign, move the `highlight`
body to read `scene`/`expandToLeaves` directly instead of `api.expandToLeaves`,
duplicating the one-line leaf expansion.)

- [ ] **Step 6: Run tests to verify they pass**

Run: `npx jest plugins/plugin-chart-bim/test/useXeokitViewer.test.ts`
Expected: PASS (existing + 4 new).

- [ ] **Step 7: Commit**

```bash
npx prettier --write plugins/plugin-chart-bim/src/types.ts plugins/plugin-chart-bim/src/useXeokitViewer.ts plugins/plugin-chart-bim/test/useXeokitViewer.test.ts
git add plugins/plugin-chart-bim/src/types.ts plugins/plugin-chart-bim/src/useXeokitViewer.ts plugins/plugin-chart-bim/test/useXeokitViewer.test.ts
git commit -m "feat(bim): add onPick and highlight to the xeokit api facade"
```

---

### Task 3: `Enable cross-filtering` control + transformProps passthrough

**Files:**
- Modify: `superset-frontend/plugins/plugin-chart-bim/src/controlPanel.tsx` (add a checkbox control)
- Modify: `superset-frontend/plugins/plugin-chart-bim/src/types.ts` (extend `BimFormData` and `BimChartProps`)
- Modify: `superset-frontend/plugins/plugin-chart-bim/src/transformProps.ts` (read + pass through)
- Test: `superset-frontend/plugins/plugin-chart-bim/test/transformProps.test.ts` (existing) — add cases

**Interfaces:**
- Consumes: `chartProps.hooks.setDataMask`, `chartProps.emitCrossFilters`, `chartProps.filterState` (standard Superset ChartProps fields).
- Produces (added to `BimChartProps`):
  - `emitCrossFilters?: boolean`
  - `setDataMask: (dataMask: DataMask) => void`
  - `filterState?: { value?: unknown }`

- [ ] **Step 1: Write the failing test**

Add to `plugins/plugin-chart-bim/test/transformProps.test.ts`:

```ts
test('passes cross-filter plumbing through to props', () => {
  const setDataMask = jest.fn();
  const props = transformProps({
    width: 1,
    height: 1,
    formData: { link_column: 'gid', emit_cross_filters: true },
    queriesData: [{ data: [] }],
    emitCrossFilters: true,
    filterState: { value: ['gid-1'] },
    hooks: { setDataMask },
  } as any);
  expect(props.emitCrossFilters).toBe(true);
  expect(props.setDataMask).toBe(setDataMask);
  expect(props.filterState).toEqual({ value: ['gid-1'] });
});

test('setDataMask defaults to a no-op when hooks omit it', () => {
  const props = transformProps({
    width: 1,
    height: 1,
    formData: {},
    queriesData: [{ data: [] }],
  } as any);
  expect(typeof props.setDataMask).toBe('function');
  expect(() => props.setDataMask({} as any)).not.toThrow();
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest plugins/plugin-chart-bim/test/transformProps.test.ts`
Expected: FAIL — `props.emitCrossFilters` / `props.setDataMask` undefined.

- [ ] **Step 3: Extend the types**

In `types.ts`, add to the `BimFormData` fields block:

```ts
    emit_cross_filters?: boolean;
    emitCrossFilters?: boolean;
```

Add to `BimChartProps` (after `overrides`), and add `DataMask` to the
`@superset-ui/core` import at the top of the file:

```ts
  // When true, clicking an element emits a Superset cross-filter.
  emitCrossFilters?: boolean;
  // Emits a cross-filter DataMask to the dashboard. A no-op when unavailable.
  setDataMask: (dataMask: DataMask) => void;
  // Incoming filter on the link column (our own click, round-tripped, or an
  // external filter). Used to highlight matching elements in the scene.
  filterState?: { value?: unknown };
```

- [ ] **Step 4: Add the control**

In `controlPanel.tsx`, add a new control row in the data-binding section (after the `color_overrides` row, before the closing of that `controlSetRows` group):

```tsx
        [
          {
            name: 'emit_cross_filters',
            config: {
              type: 'CheckboxControl',
              label: t('Enable cross-filtering'),
              description: t(
                'Clicking a 3D element emits a cross-filter on the link column, filtering the other charts on the dashboard.',
              ),
              default: true,
              renderTrigger: true,
            },
          },
        ],
```

- [ ] **Step 5: Wire transformProps**

In `transformProps.ts`, read the fields (near where `linkColumn`/`colorBy` are read) and add them to the returned object:

```ts
  const emitCrossFilters =
    (chartProps as { emitCrossFilters?: boolean }).emitCrossFilters ?? false;
  const filterState = (chartProps as { filterState?: { value?: unknown } })
    .filterState;
  const setDataMask =
    (chartProps as { hooks?: { setDataMask?: (dm: unknown) => void } }).hooks
      ?.setDataMask ?? (() => {});
```

Add to the returned object literal:

```ts
    emitCrossFilters,
    setDataMask: setDataMask as BimChartProps['setDataMask'],
    filterState,
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `npx jest plugins/plugin-chart-bim/test/transformProps.test.ts`
Expected: PASS (existing + 2 new).

- [ ] **Step 7: Commit**

```bash
npx prettier --write plugins/plugin-chart-bim/src/controlPanel.tsx plugins/plugin-chart-bim/src/types.ts plugins/plugin-chart-bim/src/transformProps.ts plugins/plugin-chart-bim/test/transformProps.test.ts
git add plugins/plugin-chart-bim/src/controlPanel.tsx plugins/plugin-chart-bim/src/types.ts plugins/plugin-chart-bim/src/transformProps.ts plugins/plugin-chart-bim/test/transformProps.test.ts
git commit -m "feat(bim): add Enable cross-filtering control and pass cross-filter plumbing"
```

---

### Task 4: Wire click→filter and filterState→highlight in `BimChart`

**Files:**
- Modify: `superset-frontend/plugins/plugin-chart-bim/src/BimChart.tsx`
- Test: `superset-frontend/plugins/plugin-chart-bim/test/BimChart.test.tsx` (existing) — add cases

**Interfaces:**
- Consumes: `buildCrossFilterDataMask`, `selectedGlobalIdsFromFilterState` (Task 1); `api.onPick`, `api.highlight` (Task 2); `emitCrossFilters`, `setDataMask`, `filterState`, `linkColumn` props (Task 3); existing `ready` from `useXeokitViewer`.
- Produces: final behavior; no new exports.

- [ ] **Step 1: Inspect the existing BimChart test mock**

Run: `sed -n '1,80p' plugins/plugin-chart-bim/test/BimChart.test.tsx`
Reuse its `useXeokitViewer` mock and `api` mock object; extend the mocked `api`
with `onPick` and `highlight` jest.fn()s, and make the mock able to return
`ready: true`/`false`.

- [ ] **Step 2: Write the failing tests**

Add to `plugins/plugin-chart-bim/test/BimChart.test.tsx`. The mocked `api.onPick`
should capture the callback so the test can invoke it to simulate a click:

```tsx
test('clicking an element emits a cross-filter when enabled', () => {
  // Render BimChart with emitCrossFilters=true, linkColumn='gid', ready=true,
  // and a mocked api whose onPick captures the callback.
  // Invoke the captured onPick callback with 'gid-1'.
  // Assert setDataMask was called with buildCrossFilterDataMask('gid','gid-1').
});

test('clicking does not emit when cross-filtering is disabled', () => {
  // emitCrossFilters=false. Invoke onPick callback with 'gid-1'.
  // Assert setDataMask was NOT called.
});

test('clicking the same element twice clears the filter', () => {
  // emitCrossFilters=true. Invoke onPick('gid-1') then onPick('gid-1').
  // Assert the second call passed buildCrossFilterDataMask('gid', null).
});

test('clicking empty space clears the filter', () => {
  // emitCrossFilters=true. Invoke onPick(null).
  // Assert setDataMask called with buildCrossFilterDataMask('gid', null).
});

test('filterState drives highlight when cross-filtering is enabled', () => {
  // emitCrossFilters=true, ready=true, filterState={ value: ['gid-1'] }.
  // Assert api.highlight was called with ['gid-1'].
});

test('does not highlight until the scene is ready', () => {
  // ready=false, filterState={ value: ['gid-1'] }.
  // Assert api.highlight was NOT called.
  // Re-render with ready=true and assert api.highlight IS called with ['gid-1'].
});
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `npx jest plugins/plugin-chart-bim/test/BimChart.test.tsx`
Expected: FAIL — `setDataMask`/`api.highlight` not called as asserted.

- [ ] **Step 4: Implement the wiring in `BimChart.tsx`**

Add imports:

```ts
import {
  buildCrossFilterDataMask,
  selectedGlobalIdsFromFilterState,
} from './crossFilter';
```

Destructure the new props (extend the existing `props` destructure):

```ts
    emitCrossFilters,
    setDataMask,
    filterState,
```

Add a ref holding the current single selection (source of truth for toggle-off
and for the disabled-mode highlight):

```ts
  const selectedRef = useRef<string | null>(null);
```

Outgoing — subscribe to picks once `api` and `ready` exist:

```ts
  useEffect(() => {
    if (!api || !ready || !linkColumn) return undefined;
    const unsubscribe = api.onPick(gid => {
      // Single-select: same element or empty space clears.
      const next = gid && gid !== selectedRef.current ? gid : null;
      selectedRef.current = next;
      if (emitCrossFilters) {
        setDataMask(buildCrossFilterDataMask(linkColumn, next));
      } else {
        // No round-trip through filterState in this mode: highlight locally.
        api.highlight(next ? [next] : []);
      }
    });
    return unsubscribe;
  }, [api, ready, linkColumn, emitCrossFilters, setDataMask]);
```

Incoming — when cross-filtering is on, highlight follows `filterState`:

```ts
  const incomingIds = emitCrossFilters
    ? selectedGlobalIdsFromFilterState(filterState)
    : null; // null => this effect is inert; local mode handles highlight above
  const incomingKey = JSON.stringify(incomingIds);
  useEffect(() => {
    if (!api || !ready || incomingIds === null) return;
    api.highlight(incomingIds);
    // Keep the ref in sync so a toggle-off click compares against what's shown.
    selectedRef.current = incomingIds[0] ?? null;
    // incomingKey encodes incomingIds by content; api/ready gate scene access.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [api, ready, incomingKey]);
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx jest plugins/plugin-chart-bim/test/BimChart.test.tsx`
Expected: PASS (existing + 6 new).

- [ ] **Step 6: Run the whole plugin suite + prettier + eslint**

```bash
npx jest plugins/plugin-chart-bim
npx prettier --check plugins/plugin-chart-bim/src plugins/plugin-chart-bim/test
npx eslint plugins/plugin-chart-bim/src/BimChart.tsx
```
Expected: all plugin tests PASS; prettier clean; eslint reports only the two
pre-existing missing-rule-definition errors (environment noise), nothing new.

- [ ] **Step 7: Commit**

```bash
git add plugins/plugin-chart-bim/src/BimChart.tsx plugins/plugin-chart-bim/test/BimChart.test.tsx
git commit -m "feat(bim): emit cross-filter on click and highlight from filter state"
```

---

## Self-Review

**Spec coverage:**
- `api.onPick` / `api.highlight` → Task 2. ✅
- `crossFilter.ts` (`buildCrossFilterDataMask`, `selectedGlobalIdsFromFilterState`) → Task 1. ✅
- transformProps passthrough (`setDataMask`, `emitCrossFilters`, `filterState`) → Task 3. ✅
- `Enable cross-filtering` control → Task 3. ✅
- Outgoing click→filter, single-select toggle → Task 4. ✅
- Incoming filterState→highlight, two-source switch by `emitCrossFilters` → Task 4. ✅
- `ready` gating (timing lesson) → Task 2 (highlight no-op on empty scene) + Task 4 (effect deps + explicit timing test). ✅
- Pick teardown on model change/unmount → Task 2 (unsubscribe) + Task 4 (effect cleanup returns unsubscribe). ✅
- Error cases (miss→clear, absent GlobalId→no-op) → Task 1 (null clear) + Task 2 (highlight skips missing objects). ✅

**Placeholder scan:** BimChart/useXeokitViewer test bodies are described as behavior with the exact assertions and the concrete mock extensions needed; the implementer adapts them to each file's existing mock (which they must read in Step 1 of each task). All source code is given in full. No TBD/TODO.

**Type consistency:** `buildCrossFilterDataMask(linkColumn, globalId)`, `selectedGlobalIdsFromFilterState(filterState)`, `onPick(cb): () => void`, `highlight(objectIds)` are used with identical signatures across Tasks 1–4. `emitCrossFilters`/`setDataMask`/`filterState` names match between Task 3 (produce) and Task 4 (consume).
