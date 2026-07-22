# BIM Data-Driven Coloring Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Color BIM model elements by a dataset column value (data → 3D), universally, with no per-model or per-dataset hardcode.

**Architecture:** Extend the existing `plugin-chart-bim` plugin following its own pattern (pure modules + engine-only hook). A pure `colorMapping` module turns dataset rows into a `globalId → rgb` map, a legend, and stats. The `useXeokitViewer` hook gains engine-only `colorize`/`resetColors`/`expandToLeaves` methods. `BimChart` orchestrates: memoize the mapping, paint neutral-grey base, then paint matches (expanding container GlobalIds to geometry leaves), and renders a legend + a "matched X of Y" diagnostic line.

**Tech Stack:** TypeScript, React (hooks), `@xeokit/xeokit-sdk` (isolated in the hook), `@superset-ui/core` / `@apache-superset/core`, Jest + React Testing Library.

## Global Constraints

- No `any` types — proper TypeScript, reuse existing types.
- No new JavaScript files — `.ts`/`.tsx` only.
- UI components from `@superset-ui/core/components` / `@apache-superset/core` — not direct antd; theme tokens, not hardcoded colors.
- New source files require the Apache ASF license header (copy verbatim from any existing file in the plugin, e.g. `src/buildTree.ts` lines 1–18).
- Comments must be timeless — no "now"/"currently"/"today".
- The coloring key is: `link_column` value == `metaObject.id` == `scene.objects[id]` == IFC GlobalId.
- Autopalette comes from Superset's `CategoricalColorNamespace.getScale(colorScheme)` — never a hardcoded palette. Neutral grey comes from a theme token.
- All new controls default to empty; when unset the plugin behaves exactly as before (3D only, no coloring).
- Run tests from `superset-frontend/`: `npm run test -- plugins/plugin-chart-bim/test/<file>`.

---

### Task 1: Pure color-mapping module — value → color, legend, stats

**Files:**
- Create: `superset-frontend/plugins/plugin-chart-bim/src/colorMapping.ts`
- Test: `superset-frontend/plugins/plugin-chart-bim/test/colorMapping.test.ts`

**Interfaces:**
- Consumes: `DataRecord` from `@superset-ui/core`.
- Produces:
  ```ts
  export interface ColorMappingInput {
    rows: DataRecord[];
    linkColumn: string;
    colorBy: string;
    // Maps a category value to a hex color. In production this is
    // CategoricalColorNamespace.getScale(colorScheme); in tests a stub.
    colorFn: (value: string) => string;
    overrides?: { value: string; color: string }[];
  }
  export interface ColorMappingResult {
    colorById: Map<string, [number, number, number]>; // rgb 0..1
    legend: { value: string; color: string }[];        // hex, unique, first-seen order
    stats: { dataKeys: number };
  }
  export function hexToRgb01(hex: string): [number, number, number];
  export default function buildColorMapping(input: ColorMappingInput): ColorMappingResult;
  ```

- [ ] **Step 1: Write the failing test**

Create the test file with the ASF header (copy lines 1–18 from `src/buildTree.ts`), then:

```ts
import buildColorMapping, { hexToRgb01 } from '../src/colorMapping';

const colorFn = (v: string) =>
  ({ Done: '#00ff00', Late: '#ff0000' }[v] ?? '#0000ff');

test('hexToRgb01 converts hex to 0..1 rgb', () => {
  expect(hexToRgb01('#ff0000')).toEqual([1, 0, 0]);
  expect(hexToRgb01('#000000')).toEqual([0, 0, 0]);
});

test('maps each link id to the rgb of its category value', () => {
  const { colorById } = buildColorMapping({
    rows: [
      { gid: 'a', status: 'Done' },
      { gid: 'b', status: 'Late' },
    ],
    linkColumn: 'gid',
    colorBy: 'status',
    colorFn,
  });
  expect(colorById.get('a')).toEqual([0, 1, 0]);
  expect(colorById.get('b')).toEqual([1, 0, 0]);
});

test('legend has one entry per unique value in first-seen order', () => {
  const { legend } = buildColorMapping({
    rows: [
      { gid: 'a', status: 'Late' },
      { gid: 'b', status: 'Done' },
      { gid: 'c', status: 'Late' },
    ],
    linkColumn: 'gid',
    colorBy: 'status',
    colorFn,
  });
  expect(legend).toEqual([
    { value: 'Late', color: '#ff0000' },
    { value: 'Done', color: '#00ff00' },
  ]);
});

test('overrides win over colorFn for the given value', () => {
  const { colorById, legend } = buildColorMapping({
    rows: [{ gid: 'a', status: 'Done' }],
    linkColumn: 'gid',
    colorBy: 'status',
    colorFn,
    overrides: [{ value: 'Done', color: '#0000ff' }],
  });
  expect(colorById.get('a')).toEqual([0, 0, 1]);
  expect(legend).toEqual([{ value: 'Done', color: '#0000ff' }]);
});

test('skips rows with null/empty color value', () => {
  const { colorById, stats } = buildColorMapping({
    rows: [
      { gid: 'a', status: null },
      { gid: 'b', status: '' },
      { gid: 'c', status: 'Done' },
    ],
    linkColumn: 'gid',
    colorBy: 'status',
    colorFn,
  });
  expect(colorById.has('a')).toBe(false);
  expect(colorById.has('b')).toBe(false);
  expect(colorById.get('c')).toEqual([0, 1, 0]);
  expect(stats.dataKeys).toBe(1);
});

test('empty rows or empty colorBy yields empty map and legend', () => {
  const r = buildColorMapping({
    rows: [],
    linkColumn: 'gid',
    colorBy: 'status',
    colorFn,
  });
  expect(r.colorById.size).toBe(0);
  expect(r.legend).toEqual([]);
  expect(r.stats.dataKeys).toBe(0);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd superset-frontend && npm run test -- plugins/plugin-chart-bim/test/colorMapping.test.ts`
Expected: FAIL — `Cannot find module '../src/colorMapping'`.

- [ ] **Step 3: Write minimal implementation**

Create `src/colorMapping.ts` with the ASF header (copy lines 1–18 from `src/buildTree.ts`), then:

```ts
import { DataRecord } from '@superset-ui/core';

export interface ColorMappingInput {
  rows: DataRecord[];
  linkColumn: string;
  colorBy: string;
  colorFn: (value: string) => string;
  overrides?: { value: string; color: string }[];
}

export interface ColorMappingResult {
  colorById: Map<string, [number, number, number]>;
  legend: { value: string; color: string }[];
  stats: { dataKeys: number };
}

// Convert a #rrggbb hex string to an rgb triple in the 0..1 range that
// xeokit's `entity.colorize` expects.
export function hexToRgb01(hex: string): [number, number, number] {
  const h = hex.replace('#', '');
  const r = parseInt(h.slice(0, 2), 16) / 255;
  const g = parseInt(h.slice(2, 4), 16) / 255;
  const b = parseInt(h.slice(4, 6), 16) / 255;
  return [r, g, b];
}

export default function buildColorMapping(
  input: ColorMappingInput,
): ColorMappingResult {
  const { rows, linkColumn, colorBy, colorFn, overrides } = input;
  const overrideMap = new Map(
    (overrides ?? []).map(o => [o.value, o.color]),
  );

  const colorById = new Map<string, [number, number, number]>();
  const legendColors = new Map<string, string>(); // value -> hex, first-seen order

  rows.forEach(row => {
    const raw = row[colorBy];
    if (raw === null || raw === undefined || raw === '') return;
    const value = String(raw);
    const id = String(row[linkColumn]);

    let hex = legendColors.get(value);
    if (hex === undefined) {
      hex = overrideMap.get(value) ?? colorFn(value);
      legendColors.set(value, hex);
    }
    colorById.set(id, hexToRgb01(hex));
  });

  const legend = Array.from(legendColors.entries()).map(([value, color]) => ({
    value,
    color,
  }));
  return { colorById, legend, stats: { dataKeys: colorById.size } };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd superset-frontend && npm run test -- plugins/plugin-chart-bim/test/colorMapping.test.ts`
Expected: PASS (all tests).

- [ ] **Step 5: Commit**

```bash
git add superset-frontend/plugins/plugin-chart-bim/src/colorMapping.ts \
        superset-frontend/plugins/plugin-chart-bim/test/colorMapping.test.ts
git commit -m "feat(bim): pure color-mapping module for data-driven coloring"
```

---

### Task 2: Extend viewer API — colorize, resetColors, expandToLeaves

**Files:**
- Modify: `superset-frontend/plugins/plugin-chart-bim/src/types.ts:74-83` (the `XeokitApi` interface)
- Modify: `superset-frontend/plugins/plugin-chart-bim/src/useXeokitViewer.ts:95-127` (add methods to `api`)
- Test: `superset-frontend/plugins/plugin-chart-bim/test/useXeokitViewer.test.ts` (extend existing mock + add tests)

**Interfaces:**
- Consumes: existing `XeokitApi`, `scene.objects` (`Record<string, { visible: boolean }>`), `viewer.metaScene`.
- Produces (added to `XeokitApi`):
  ```ts
  colorize(objectIds: string[], rgb: [number, number, number]): void;
  resetColors(objectIds?: string[]): void;      // undefined → all objects
  expandToLeaves(id: string): string[];          // geometry object ids under id (or id itself)
  allObjectIds(): string[];                      // every scene object id
  ```

- [ ] **Step 1: Write the failing test**

Extend the mock in `test/useXeokitViewer.test.ts`. The `objects` records must now carry a `colorize` field, and the mocked `Viewer` must expose `metaScene.getObjectIDsInSubtree`. Replace the `objects` and `metaObjects` blocks and the `jest.mock` scene with:

```ts
const objects: Record<string, { visible: boolean; colorize: number[] }> = {
  storey: { visible: true, colorize: [1, 1, 1] },
  wall: { visible: true, colorize: [1, 1, 1] },
  door: { visible: true, colorize: [1, 1, 1] },
};
```

In the `jest.mock('@xeokit/xeokit-sdk', ...)` `Viewer` scene object, extend `metaScene` so subtree expansion is testable:

```ts
metaScene: {
  metaObjects,
  // storey contains wall+door; leaves return themselves.
  getObjectIDsInSubtree: (id: string) =>
    id === 'storey' ? ['storey', 'wall', 'door'] : [id],
},
```

Update `beforeEach` to also reset colorize:

```ts
beforeEach(() => {
  loadedCb = undefined;
  objects.storey.visible = true;
  objects.wall.visible = true;
  objects.door.visible = true;
  objects.storey.colorize = [1, 1, 1];
  objects.wall.colorize = [1, 1, 1];
  objects.door.colorize = [1, 1, 1];
});
```

Then add these tests:

```ts
test('api.colorize sets colorize only on existing objects', async () => {
  const { result } = renderViewer();
  await waitFor(() => expect(result.current.api).toBeDefined());
  act(() => result.current.api!.colorize(['wall', 'ghost'], [1, 0, 0]));
  expect(objects.wall.colorize).toEqual([1, 0, 0]);
  expect(objects.door.colorize).toEqual([1, 1, 1]);
});

test('api.resetColors with no args resets all objects', async () => {
  const { result } = renderViewer();
  await waitFor(() => expect(result.current.api).toBeDefined());
  act(() => result.current.api!.colorize(['wall', 'door'], [1, 0, 0]));
  act(() => result.current.api!.resetColors());
  expect(objects.wall.colorize).toEqual([1, 1, 1]);
  expect(objects.door.colorize).toEqual([1, 1, 1]);
});

test('api.resetColors with ids resets only those', async () => {
  const { result } = renderViewer();
  await waitFor(() => expect(result.current.api).toBeDefined());
  act(() => result.current.api!.colorize(['wall', 'door'], [1, 0, 0]));
  act(() => result.current.api!.resetColors(['wall']));
  expect(objects.wall.colorize).toEqual([1, 1, 1]);
  expect(objects.door.colorize).toEqual([1, 0, 0]);
});

test('api.expandToLeaves returns geometry leaves under a container', async () => {
  const { result } = renderViewer();
  await waitFor(() => expect(result.current.api).toBeDefined());
  expect(result.current.api!.expandToLeaves('storey').sort()).toEqual(
    ['door', 'storey', 'wall'],
  );
  expect(result.current.api!.expandToLeaves('wall')).toEqual(['wall']);
});

test('api.allObjectIds returns every scene object id', async () => {
  const { result } = renderViewer();
  await waitFor(() => expect(result.current.api).toBeDefined());
  expect(result.current.api!.allObjectIds().sort()).toEqual(
    ['door', 'storey', 'wall'],
  );
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd superset-frontend && npm run test -- plugins/plugin-chart-bim/test/useXeokitViewer.test.ts`
Expected: FAIL — `api.colorize is not a function` (and the other new methods undefined).

- [ ] **Step 3: Write minimal implementation**

In `src/types.ts`, add to the `XeokitApi` interface (after `getVisibility`, before the closing brace at line 83):

```ts
  // Set the RGB colorize multiplier (0..1) on the given objects. Non-existent
  // ids are silently ignored.
  colorize(objectIds: string[], rgb: [number, number, number]): void;
  // Reset colorize to neutral [1,1,1] for the given objects, or all objects
  // when omitted.
  resetColors(objectIds?: string[]): void;
  // Expand a metaObject id to the geometry object ids beneath it (or the id
  // itself when it is a geometry leaf). Non-geometry ids are filtered out.
  expandToLeaves(id: string): string[];
  // Every geometry object id in the scene.
  allObjectIds(): string[];
```

In `src/useXeokitViewer.ts`, widen the `scene` cast (line 95-97) to include `colorize` and `metaScene`:

```ts
        const scene = viewer.scene as unknown as {
          objects: Record<string, { visible: boolean; colorize: number[] }>;
        };
        const metaScene2 = viewer.metaScene as unknown as {
          getObjectIDsInSubtree: (id: string) => string[];
        };
```

Then add to the `api` object (inside the `const api: XeokitApi = { ... }` block, after `getVisibility`):

```ts
          colorize: (ids, rgb) => {
            ids.forEach(id => {
              const obj = scene.objects[id];
              if (obj) obj.colorize = rgb;
            });
          },
          resetColors: ids => {
            const target = ids ?? Object.keys(scene.objects);
            target.forEach(id => {
              const obj = scene.objects[id];
              if (obj) obj.colorize = [1, 1, 1];
            });
          },
          expandToLeaves: id =>
            metaScene2
              .getObjectIDsInSubtree(id)
              .filter(oid => !!scene.objects[oid]),
          allObjectIds: () => Object.keys(scene.objects),
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd superset-frontend && npm run test -- plugins/plugin-chart-bim/test/useXeokitViewer.test.ts`
Expected: PASS (existing tests + 5 new).

- [ ] **Step 5: Commit**

```bash
git add superset-frontend/plugins/plugin-chart-bim/src/types.ts \
        superset-frontend/plugins/plugin-chart-bim/src/useXeokitViewer.ts \
        superset-frontend/plugins/plugin-chart-bim/test/useXeokitViewer.test.ts
git commit -m "feat(bim): add colorize/resetColors/expandToLeaves to viewer api"
```

---

### Task 3: Control panel + query — link_column, color_by, color_overrides

**Files:**
- Modify: `superset-frontend/plugins/plugin-chart-bim/src/controlPanel.tsx` (add "Data binding" section)
- Modify: `superset-frontend/plugins/plugin-chart-bim/src/buildQuery.ts` (groupby)
- Modify: `superset-frontend/plugins/plugin-chart-bim/src/types.ts` (extend `BimFormData`)
- Test: `superset-frontend/plugins/plugin-chart-bim/test/buildQuery.test.ts` (create)

**Interfaces:**
- Consumes: `columnChoices`, `ControlPanelState` (already imported in controlPanel), `buildQueryContext` (already imported in buildQuery).
- Produces: control names `link_column`, `color_by`, `color_overrides`; `buildQuery` adds `link_column` and `color_by` to `groupby` when both are set.

- [ ] **Step 1: Write the failing test**

Create `test/buildQuery.test.ts` with the ASF header (copy lines 1–18 from `src/buildTree.ts`), then:

```ts
import buildQuery from '../src/buildQuery';

const base = {
  datasource: '1__table',
  viz_type: 'bim',
} as any;

test('adds link_column and color_by to groupby when both set', () => {
  const q = buildQuery({ ...base, link_column: 'gid', color_by: 'status' });
  expect(q.queries[0].columns).toEqual(['gid', 'status']);
});

test('no groupby when link_column or color_by missing', () => {
  const q = buildQuery({ ...base, link_column: 'gid' });
  expect(q.queries[0].columns ?? []).toEqual([]);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd superset-frontend && npm run test -- plugins/plugin-chart-bim/test/buildQuery.test.ts`
Expected: FAIL — `columns` is `undefined`/empty because buildQuery ignores the new fields.

- [ ] **Step 3: Write minimal implementation**

Replace the body of `src/buildQuery.ts` (keep the ASF header, lines 1–18):

```ts
import { buildQueryContext, QueryFormData } from '@superset-ui/core';

export default function buildQuery(formData: QueryFormData) {
  const linkColumn = (formData.link_column ?? formData.linkColumn) as
    | string
    | undefined;
  const colorBy = (formData.color_by ?? formData.colorBy) as
    | string
    | undefined;
  return buildQueryContext(formData, baseQueryObject => [
    {
      ...baseQueryObject,
      columns:
        linkColumn && colorBy
          ? [linkColumn, colorBy]
          : baseQueryObject.columns,
    },
  ]);
}
```

In `src/controlPanel.tsx`, add a new section object after the `Model source` section (before `Viewer`):

```tsx
    {
      label: t('Data binding'),
      expanded: true,
      controlSetRows: [
        [
          {
            name: 'link_column',
            config: {
              type: 'SelectControl',
              label: t('Element GlobalId column'),
              description: t(
                'Dataset column holding the element IFC GlobalId. Required for coloring.',
              ),
              default: null,
              mapStateToProps: (state: ControlPanelState) => ({
                choices: columnChoices(state.datasource),
              }),
            },
          },
        ],
        [
          {
            name: 'color_by',
            config: {
              type: 'SelectControl',
              label: t('Color by column'),
              description: t(
                'Dataset column whose value drives element color. Leave empty for no coloring.',
              ),
              default: null,
              mapStateToProps: (state: ControlPanelState) => ({
                choices: columnChoices(state.datasource),
              }),
            },
          },
        ],
        [
          {
            name: 'color_overrides',
            config: {
              type: 'TextAreaControl',
              language: 'json',
              label: t('Color overrides (JSON)'),
              description: t(
                'Optional JSON array of {"value","color"} pairs overriding the automatic palette, e.g. [{"value":"Done","color":"#00ff00"}].',
              ),
              default: '',
              renderTrigger: true,
            },
          },
        ],
      ],
    },
```

In `src/types.ts`, add to `BimFormData` (near the reserved comment block at lines 46-50, replacing those commented lines):

```ts
    link_column?: string;
    color_by?: string;
    color_overrides?: string; // JSON string of { value, color }[]
    linkColumn?: string;
    colorBy?: string;
    colorOverrides?: string;
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd superset-frontend && npm run test -- plugins/plugin-chart-bim/test/buildQuery.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add superset-frontend/plugins/plugin-chart-bim/src/controlPanel.tsx \
        superset-frontend/plugins/plugin-chart-bim/src/buildQuery.ts \
        superset-frontend/plugins/plugin-chart-bim/src/types.ts \
        superset-frontend/plugins/plugin-chart-bim/test/buildQuery.test.ts
git commit -m "feat(bim): add data-binding controls and groupby query"
```

---

### Task 4: transformProps — pass rows, columns, colorFn, overrides, neutral

**Files:**
- Modify: `superset-frontend/plugins/plugin-chart-bim/src/transformProps.ts`
- Modify: `superset-frontend/plugins/plugin-chart-bim/src/types.ts` (extend `BimChartProps`)
- Test: `superset-frontend/plugins/plugin-chart-bim/test/transformProps.test.ts` (extend existing)

**Interfaces:**
- Consumes: `ChartProps`, `CategoricalColorNamespace` from `@superset-ui/core`, `buildColorMapping` types from Task 1.
- Produces (added to `BimChartProps`):
  ```ts
  rows: DataRecord[];
  linkColumn?: string;
  colorBy?: string;
  colorFn: (value: string) => string;
  overrides: { value: string; color: string }[];
  ```

- [ ] **Step 1: Write the failing test**

Add to `test/transformProps.test.ts`:

```ts
test('passes rows, link/color columns and a colorFn to props', () => {
  const props = transformProps({
    width: 100,
    height: 100,
    formData: {
      link_column: 'gid',
      color_by: 'status',
      color_overrides: '[{"value":"Done","color":"#00ff00"}]',
    },
    queriesData: [{ data: [{ gid: 'a', status: 'Done' }] }],
  } as any);
  expect(props.rows).toEqual([{ gid: 'a', status: 'Done' }]);
  expect(props.linkColumn).toBe('gid');
  expect(props.colorBy).toBe('status');
  expect(props.overrides).toEqual([{ value: 'Done', color: '#00ff00' }]);
  expect(typeof props.colorFn).toBe('function');
});

test('overrides default to [] on invalid or empty json', () => {
  const props = transformProps({
    width: 1,
    height: 1,
    formData: { color_overrides: 'not json' },
    queriesData: [{ data: [] }],
  } as any);
  expect(props.overrides).toEqual([]);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd superset-frontend && npm run test -- plugins/plugin-chart-bim/test/transformProps.test.ts`
Expected: FAIL — `props.rows`/`props.colorFn` undefined.

- [ ] **Step 3: Write minimal implementation**

In `src/types.ts`, add to `BimChartProps`:

```ts
  rows: DataRecord[];
  linkColumn?: string;
  colorBy?: string;
  colorFn: (value: string) => string;
  overrides: { value: string; color: string }[];
```

Ensure `DataRecord` is imported in `types.ts`:

```ts
import { QueryFormData, DataRecord } from '@superset-ui/core';
```

In `src/transformProps.ts`, add imports and extend the return. After the existing `const data = ...` line, add:

```ts
  const linkColumn = fd.linkColumn ?? fd.link_column;
  const colorBy = fd.colorBy ?? fd.color_by;

  // Same categorical palette every Superset chart uses; no hardcoded colors.
  const colorScheme = (fd.color_scheme ?? fd.colorScheme) as string | undefined;
  const scale = CategoricalColorNamespace.getScale(colorScheme as string);
  const colorFn = (value: string) => scale.getColor(value) as string;

  let overrides: { value: string; color: string }[] = [];
  const rawOverrides = fd.colorOverrides ?? fd.color_overrides;
  if (rawOverrides) {
    try {
      const parsed = JSON.parse(rawOverrides);
      if (Array.isArray(parsed)) overrides = parsed;
    } catch {
      // Invalid JSON: fall back to the automatic palette only.
      overrides = [];
    }
  }
```

Add the import at the top:

```ts
import {
  ChartProps,
  DataRecord,
  CategoricalColorNamespace,
} from '@superset-ui/core';
```

Add to the returned object:

```ts
    rows: data,
    linkColumn,
    colorBy,
    colorFn,
    overrides,
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd superset-frontend && npm run test -- plugins/plugin-chart-bim/test/transformProps.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add superset-frontend/plugins/plugin-chart-bim/src/transformProps.ts \
        superset-frontend/plugins/plugin-chart-bim/src/types.ts \
        superset-frontend/plugins/plugin-chart-bim/test/transformProps.test.ts
git commit -m "feat(bim): pass data-binding props from transformProps"
```

---

### Task 5: ColorLegend component

**Files:**
- Create: `superset-frontend/plugins/plugin-chart-bim/src/ColorLegend.tsx`
- Test: `superset-frontend/plugins/plugin-chart-bim/test/ColorLegend.test.tsx`

**Interfaces:**
- Consumes: `styled` from `@apache-superset/core/theme`.
- Produces:
  ```ts
  export interface ColorLegendProps {
    legend: { value: string; color: string }[];
  }
  export default function ColorLegend(props: ColorLegendProps): JSX.Element | null;
  ```

- [ ] **Step 1: Write the failing test**

Create `test/ColorLegend.test.tsx` with ASF header, then:

```tsx
import { render, screen } from '@testing-library/react';
import ColorLegend from '../src/ColorLegend';

test('renders one chip per legend entry', () => {
  render(
    <ColorLegend
      legend={[
        { value: 'Done', color: '#00ff00' },
        { value: 'Late', color: '#ff0000' },
      ]}
    />,
  );
  expect(screen.getByText('Done')).toBeInTheDocument();
  expect(screen.getByText('Late')).toBeInTheDocument();
});

test('renders nothing when legend is empty', () => {
  const { container } = render(<ColorLegend legend={[]} />);
  expect(container).toBeEmptyDOMElement();
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd superset-frontend && npm run test -- plugins/plugin-chart-bim/test/ColorLegend.test.tsx`
Expected: FAIL — `Cannot find module '../src/ColorLegend'`.

- [ ] **Step 3: Write minimal implementation**

Create `src/ColorLegend.tsx` with ASF header, then:

```tsx
import { styled } from '@apache-superset/core/theme';

export interface ColorLegendProps {
  legend: { value: string; color: string }[];
}

const Wrap = styled.div`
  position: absolute;
  right: ${({ theme }) => theme.sizeUnit * 2}px;
  bottom: ${({ theme }) => theme.sizeUnit * 2}px;
  z-index: 10;
  max-height: 40%;
  overflow-y: auto;
  padding: ${({ theme }) => theme.sizeUnit * 2}px;
  background: ${({ theme }) => theme.colorBgContainer};
  border: 1px solid ${({ theme }) => theme.colorBorder};
  border-radius: ${({ theme }) => theme.borderRadius}px;
`;

const Row = styled.div`
  display: flex;
  align-items: center;
  gap: ${({ theme }) => theme.sizeUnit}px;
  font-size: ${({ theme }) => theme.fontSizeSM}px;
  color: ${({ theme }) => theme.colorText};
`;

const Swatch = styled.span<{ color: string }>`
  width: ${({ theme }) => theme.sizeUnit * 2}px;
  height: ${({ theme }) => theme.sizeUnit * 2}px;
  border-radius: 2px;
  background: ${({ color }) => color};
  flex: none;
`;

export default function ColorLegend({ legend }: ColorLegendProps) {
  if (!legend.length) return null;
  return (
    <Wrap data-test="bim-legend">
      {legend.map(({ value, color }) => (
        <Row key={value}>
          <Swatch color={color} />
          <span>{value}</span>
        </Row>
      ))}
    </Wrap>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd superset-frontend && npm run test -- plugins/plugin-chart-bim/test/ColorLegend.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add superset-frontend/plugins/plugin-chart-bim/src/ColorLegend.tsx \
        superset-frontend/plugins/plugin-chart-bim/test/ColorLegend.test.tsx
git commit -m "feat(bim): add ColorLegend overlay component"
```

---

### Task 6: BimChart orchestration — paint + legend + diagnostic

**Files:**
- Modify: `superset-frontend/plugins/plugin-chart-bim/src/BimChart.tsx`
- Test: `superset-frontend/plugins/plugin-chart-bim/test/BimChart.test.tsx` (extend existing)

**Interfaces:**
- Consumes: `buildColorMapping` (Task 1), `XeokitApi.colorize/resetColors/expandToLeaves/allObjectIds` (Task 2), `ColorLegend` (Task 5), the extended `BimChartProps` (Task 4), `useTheme` from `@apache-superset/core/theme`.
- Produces: painted scene as a side effect; renders `<ColorLegend/>` and a `data-test="bim-diagnostic"` line.

- [ ] **Step 1: Write the failing test**

The existing `BimChart.test.tsx` mocks `useXeokitViewer`. Extend the mock `api` to include the new methods and add tests. Add to the test file:

```tsx
import { render, screen, waitFor } from '@testing-library/react';

const colorize = jest.fn();
const resetColors = jest.fn();
const expandToLeaves = jest.fn((id: string) =>
  id === 'storey' ? ['wall', 'door'] : [id],
);
const allObjectIds = jest.fn(() => ['storey', 'wall', 'door']);

// In the useXeokitViewer mock return value, provide:
//   api: { setVisible, isolate, showAll, getVisibility,
//          colorize, resetColors, expandToLeaves, allObjectIds }
// loading:false, error:undefined, tree:undefined

test('paints neutral base then colored matches, in order', async () => {
  render(
    <BimChart
      {...baseProps}
      modelUrl="/model"
      rows={[{ gid: 'wall', status: 'Done' }]}
      linkColumn="gid"
      colorBy="status"
      colorFn={() => '#00ff00'}
      overrides={[]}
    />,
  );
  await waitFor(() => expect(colorize).toHaveBeenCalled());
  expect(resetColors).toHaveBeenCalled();
  // First colorize call is the neutral base over all objects.
  expect(colorize.mock.calls[0][0]).toEqual(['storey', 'wall', 'door']);
  // A later call paints the matched leaf(s) with the mapped rgb.
  expect(
    colorize.mock.calls.some(
      c => JSON.stringify(c[0]) === JSON.stringify(['wall']),
    ),
  ).toBe(true);
});

test('expands a container GlobalId to its leaves before painting', async () => {
  render(
    <BimChart
      {...baseProps}
      modelUrl="/model"
      rows={[{ gid: 'storey', status: 'Done' }]}
      linkColumn="gid"
      colorBy="status"
      colorFn={() => '#00ff00'}
      overrides={[]}
    />,
  );
  await waitFor(() => expect(expandToLeaves).toHaveBeenCalledWith('storey'));
});

test('shows a matched X of Y diagnostic', async () => {
  render(
    <BimChart
      {...baseProps}
      modelUrl="/model"
      rows={[{ gid: 'wall', status: 'Done' }]}
      linkColumn="gid"
      colorBy="status"
      colorFn={() => '#00ff00'}
      overrides={[]}
    />,
  );
  await waitFor(() =>
    expect(screen.getByTestId('bim-diagnostic')).toHaveTextContent('1'),
  );
});

test('no legend and no painting when colorBy is absent', async () => {
  render(<BimChart {...baseProps} modelUrl="/model" rows={[]} overrides={[]} colorFn={() => '#000'} />);
  await waitFor(() => expect(screen.queryByTestId('bim-legend')).toBeNull());
  expect(colorize).not.toHaveBeenCalled();
});
```

Note: `baseProps` must include the required `BimChartProps` fields (`width`, `height`, `formData`, `backgroundColor`, `showEdges`, `navMode`). Reuse whatever the existing tests already build; add `rows: []`, `overrides: []`, `colorFn: () => '#000'` defaults where a test does not override them.

Add a `beforeEach` to clear the mocks:

```ts
beforeEach(() => {
  colorize.mockClear();
  resetColors.mockClear();
  expandToLeaves.mockClear();
  allObjectIds.mockClear();
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd superset-frontend && npm run test -- plugins/plugin-chart-bim/test/BimChart.test.tsx`
Expected: FAIL — new props not used; `colorize`/diagnostic never invoked/rendered.

- [ ] **Step 3: Write minimal implementation**

In `src/BimChart.tsx`:

Add imports:

```ts
import { useEffect, useMemo, useRef, useState } from 'react';
import { useTheme } from '@apache-superset/core/theme';
import buildColorMapping, { hexToRgb01 } from './colorMapping';
import ColorLegend from './ColorLegend';
```

Destructure the new props:

```ts
  const { width, height, modelUrl, backgroundColor, showEdges, navMode,
    rows, linkColumn, colorBy, colorFn, overrides } = props;
  const theme = useTheme();
```

Compute the mapping (after the `useXeokitViewer` call):

```ts
  const { colorById, legend } = useMemo(() => {
    if (!linkColumn || !colorBy) {
      return { colorById: new Map(), legend: [] as { value: string; color: string }[] };
    }
    return buildColorMapping({ rows, linkColumn, colorBy, colorFn, overrides });
  }, [rows, linkColumn, colorBy, colorFn, overrides]);

  const [matched, setMatched] = useState<{ m: number; n: number } | null>(null);

  useEffect(() => {
    if (!api || !colorById.size) {
      setMatched(null);
      return;
    }
    api.resetColors();
    const neutral = hexToRgb01(theme.colorFillSecondary ?? '#cccccc');
    const allIds = api.allObjectIds();
    api.colorize(allIds, neutral);
    const present = new Set(allIds);
    const matchedIds = new Set<string>();
    colorById.forEach((rgb, gid) => {
      const leaves = api.expandToLeaves(gid).filter(id => present.has(id));
      if (leaves.length) {
        api.colorize(leaves, rgb);
        leaves.forEach(id => matchedIds.add(id));
      }
    });
    setMatched({ m: matchedIds.size, n: colorById.size });
  }, [api, colorById, theme]);
```

Add to the JSX, inside `<Container>` after the `<ModelTree/>` block:

```tsx
      {modelUrl && !loading && !error && api && (
        <ColorLegend legend={legend} />
      )}
      {matched && (
        <Diagnostic data-test="bim-diagnostic" data-testid="bim-diagnostic">
          {t('Matched %s of %s', matched.m, matched.n)}
        </Diagnostic>
      )}
```

Add the `Diagnostic` styled component near the other styled blocks:

```ts
const Diagnostic = styled.div`
  position: absolute;
  left: ${({ theme }) => theme.sizeUnit * 2}px;
  bottom: ${({ theme }) => theme.sizeUnit * 2}px;
  z-index: 10;
  padding: ${({ theme }) => theme.sizeUnit}px ${({ theme }) => theme.sizeUnit * 2}px;
  font-size: ${({ theme }) => theme.fontSizeSM}px;
  color: ${({ theme }) => theme.colorTextTertiary};
  background: ${({ theme }) => theme.colorBgContainer};
  border-radius: ${({ theme }) => theme.borderRadius}px;
`;
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd superset-frontend && npm run test -- plugins/plugin-chart-bim/test/BimChart.test.tsx`
Expected: PASS (existing + new tests).

- [ ] **Step 5: Commit**

```bash
git add superset-frontend/plugins/plugin-chart-bim/src/BimChart.tsx \
        superset-frontend/plugins/plugin-chart-bim/test/BimChart.test.tsx
git commit -m "feat(bim): color elements by data, render legend and match diagnostic"
```

---

### Task 7: Full suite green + lint

**Files:** none (verification task).

- [ ] **Step 1: Run the whole plugin test suite**

Run: `cd superset-frontend && npm run test -- plugins/plugin-chart-bim`
Expected: all test files PASS.

- [ ] **Step 2: Lint the plugin**

Run: `cd superset-frontend && npm run lint -- plugins/plugin-chart-bim/src`
Expected: no errors. Fix any `any`/formatting issues inline, re-run.

- [ ] **Step 3: Commit any lint fixes**

```bash
git add superset-frontend/plugins/plugin-chart-bim
git commit -m "chore(bim): lint fixes for data-driven coloring"
```

(Skip the commit if there was nothing to fix.)

---

## Self-Review Notes

- **Spec coverage:** key/link (`link_column`) → Task 3; groupby-as-VCAD → Task 3; autopalette via CategoricalColorNamespace → Task 4; manual overrides → Tasks 1/3/4; pure mapping module → Task 1; engine-only colorize/expand → Task 2; recursive container coloring → Task 2 (`expandToLeaves`) + Task 6; neutral grey for non-matches → Task 6; legend → Tasks 5/6; "matched X of Y" diagnostic → Task 6; empty controls = no coloring → Tasks 3/4/6. All spec sections covered.
- **Type consistency:** `colorById: Map<string,[number,number,number]>`, `legend: {value,color}[]`, `colorFn: (value:string)=>string`, `expandToLeaves(id):string[]`, `allObjectIds():string[]` used identically across tasks.
- **Open verification point for the implementer:** confirm the exact theme token for neutral grey (`theme.colorFillSecondary`) resolves in the installed theme; the code already falls back to `#cccccc` if absent, so tests are unaffected. Likewise confirm `TextAreaControl` supports the `language: 'json'` prop in this Superset version; if not, drop that prop (plain textarea still works).
