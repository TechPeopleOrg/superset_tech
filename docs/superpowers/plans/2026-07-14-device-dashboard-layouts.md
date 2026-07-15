# Device-Specific Dashboard Layouts Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Per-dashboard opt-in desktop/tablet/mobile layout versions: a device switcher in the edit-mode header, independent layout trees, automatic version selection by viewport width for viewers.

**Architecture:** Desktop layout stays in `dashboards.position_json` (unchanged). Tablet/mobile trees live in `json_metadata.device_layouts.{tablet,mobile}`; the opt-in flag is `json_metadata.device_layouts_enabled`. In Redux the undoable `dashboardLayout` slice always holds the *active* tree so all existing grid/DnD components work untouched; inactive trees are parked in `dashboardState.inactiveDeviceLayouts`. One backend change: slice-id sync and uuid stamping walk device trees too.

**Tech Stack:** React/TypeScript + Redux (redux-undo), Flask/SQLAlchemy, Jest, pytest.

**Spec:** `docs/superpowers/specs/2026-07-14-device-dashboard-layouts-design.md`

## Global Constraints

- Branch: `feat/device-dashboard-layouts` (already created from `techpeople_master`).
- No `any` types; TypeScript only; functional components with hooks (CLAUDE.md).
- UI components from `@superset-ui/core/components`, not antd directly.
- New code files need ASF license headers (copy the header block from a sibling file).
- Python: type hints, mypy-clean.
- No `Co-Authored-By` lines in commits (user preference).
- User-facing strings wrapped in `t()`.
- Breakpoints: mobile `< 768`, tablet `768–1024` (exclusive upper), desktop `>= 1024`. Edit canvas: tablet 768px, mobile 375px.
- Frontend commands run from `superset-frontend/`. Backend tests run inside Docker (`superset_tech-superset` image / `docker compose exec superset`), the host has no Python deps.
- Do not run `npm run test` without a file filter (the suite is huge); always target specific test files.

---

### Task 1: Device-layout util module (pure functions)

**Files:**
- Create: `superset-frontend/src/dashboard/util/deviceLayouts.ts`
- Test: `superset-frontend/src/dashboard/util/deviceLayouts.test.ts`

**Interfaces:**
- Produces (used by every later frontend task):
  - `type DashboardDevice = 'desktop' | 'tablet' | 'mobile'`
  - `type DeviceLayoutKey = 'tablet' | 'mobile'`
  - `MOBILE_MAX_SCREEN_WIDTH = 768`, `TABLET_MAX_SCREEN_WIDTH = 1024`
  - `DEVICE_EDIT_CANVAS_WIDTH: Record<DeviceLayoutKey, number>` = `{ tablet: 768, mobile: 375 }`
  - `resolveDeviceByWidth(width: number): DashboardDevice`
  - `isDeviceLayoutsEnabled(metadata?: JsonObject | null): boolean`
  - `getDeviceLayoutTrees(metadata?: JsonObject | null): Partial<Record<DeviceLayoutKey, DashboardLayout>>`
  - `resolveActiveLayoutDevice(metadata: JsonObject | null | undefined, width: number): DashboardDevice` — cascade; returns the device whose tree should be used (`'desktop'` when falling back)
  - `interface DeviceLayoutsPayloadPieces { present: DashboardLayout; pastLength: number; activeDevice: DashboardDevice; inactiveDeviceLayouts: Partial<Record<DashboardDevice, DashboardLayout>>; customizedDeviceLayouts: DashboardDevice[] }`
  - `buildDeviceLayoutsPayload(pieces: DeviceLayoutsPayloadPieces): { positions: DashboardLayout; deviceLayouts?: Partial<Record<DeviceLayoutKey, DashboardLayout>> }`

- [ ] **Step 1: Write the failing tests**

```ts
// superset-frontend/src/dashboard/util/deviceLayouts.test.ts (add ASF header)
import {
  resolveDeviceByWidth,
  isDeviceLayoutsEnabled,
  getDeviceLayoutTrees,
  resolveActiveLayoutDevice,
  buildDeviceLayoutsPayload,
} from './deviceLayouts';
import { DashboardLayout } from '../types';

const tree = (marker: string) =>
  ({ [marker]: { id: marker, type: 'ROW', children: [] } }) as unknown as DashboardLayout;

test('resolveDeviceByWidth maps widths to devices', () => {
  expect(resolveDeviceByWidth(375)).toBe('mobile');
  expect(resolveDeviceByWidth(767)).toBe('mobile');
  expect(resolveDeviceByWidth(768)).toBe('tablet');
  expect(resolveDeviceByWidth(1023)).toBe('tablet');
  expect(resolveDeviceByWidth(1024)).toBe('desktop');
  expect(resolveDeviceByWidth(1920)).toBe('desktop');
});

test('isDeviceLayoutsEnabled reads the metadata flag', () => {
  expect(isDeviceLayoutsEnabled({ device_layouts_enabled: true })).toBe(true);
  expect(isDeviceLayoutsEnabled({ device_layouts_enabled: false })).toBe(false);
  expect(isDeviceLayoutsEnabled({})).toBe(false);
  expect(isDeviceLayoutsEnabled(null)).toBe(false);
});

test('getDeviceLayoutTrees returns only valid trees', () => {
  expect(getDeviceLayoutTrees(null)).toEqual({});
  expect(getDeviceLayoutTrees({ device_layouts: { mobile: tree('m') } })).toEqual({
    mobile: tree('m'),
  });
  expect(
    getDeviceLayoutTrees({ device_layouts: { mobile: 'garbage', tablet: null } }),
  ).toEqual({});
});

test('resolveActiveLayoutDevice cascades mobile→tablet→desktop', () => {
  const md = { device_layouts_enabled: true, device_layouts: { tablet: tree('t') } };
  expect(resolveActiveLayoutDevice(md, 375)).toBe('tablet'); // no mobile tree → tablet
  expect(resolveActiveLayoutDevice(md, 800)).toBe('tablet');
  expect(resolveActiveLayoutDevice(md, 1400)).toBe('desktop');
  const mdFull = {
    device_layouts_enabled: true,
    device_layouts: { tablet: tree('t'), mobile: tree('m') },
  };
  expect(resolveActiveLayoutDevice(mdFull, 375)).toBe('mobile');
  expect(resolveActiveLayoutDevice({ device_layouts_enabled: true }, 375)).toBe('desktop');
  // feature disabled → always desktop even if trees exist
  expect(
    resolveActiveLayoutDevice({ device_layouts: { mobile: tree('m') } }, 375),
  ).toBe('desktop');
});

test('buildDeviceLayoutsPayload always returns desktop positions', () => {
  const desktop = tree('d');
  const mobile = tree('m');
  // active device is mobile with edits → mobile persisted, desktop from parked
  const withEdits = buildDeviceLayoutsPayload({
    present: mobile,
    pastLength: 2,
    activeDevice: 'mobile',
    inactiveDeviceLayouts: { desktop },
    customizedDeviceLayouts: [],
  });
  expect(withEdits.positions).toBe(desktop);
  expect(withEdits.deviceLayouts).toEqual({ mobile });
  // untouched copy is NOT persisted
  const untouched = buildDeviceLayoutsPayload({
    present: mobile,
    pastLength: 0,
    activeDevice: 'mobile',
    inactiveDeviceLayouts: { desktop },
    customizedDeviceLayouts: [],
  });
  expect(untouched.positions).toBe(desktop);
  expect(untouched.deviceLayouts).toBeUndefined();
  // previously customized parked tree stays persisted
  const parked = buildDeviceLayoutsPayload({
    present: desktop,
    pastLength: 5,
    activeDevice: 'desktop',
    inactiveDeviceLayouts: { tablet: tree('t') },
    customizedDeviceLayouts: ['tablet'],
  });
  expect(parked.positions).toBe(desktop);
  expect(parked.deviceLayouts).toEqual({ tablet: tree('t') });
});
```

- [ ] **Step 2: Run tests, verify they fail**

Run: `cd superset-frontend && npm run test -- src/dashboard/util/deviceLayouts.test.ts`
Expected: FAIL — cannot find module `./deviceLayouts`.

- [ ] **Step 3: Implement the module**

```ts
// superset-frontend/src/dashboard/util/deviceLayouts.ts (add ASF header)
import { JsonObject } from '@superset-ui/core';
import { DashboardLayout } from '../types';

export type DashboardDevice = 'desktop' | 'tablet' | 'mobile';
export type DeviceLayoutKey = 'tablet' | 'mobile';

export const MOBILE_MAX_SCREEN_WIDTH = 768;
export const TABLET_MAX_SCREEN_WIDTH = 1024;

export const DEVICE_EDIT_CANVAS_WIDTH: Record<DeviceLayoutKey, number> = {
  tablet: 768,
  mobile: 375,
};

export function resolveDeviceByWidth(width: number): DashboardDevice {
  if (width < MOBILE_MAX_SCREEN_WIDTH) return 'mobile';
  if (width < TABLET_MAX_SCREEN_WIDTH) return 'tablet';
  return 'desktop';
}

export function isDeviceLayoutsEnabled(metadata?: JsonObject | null): boolean {
  return Boolean(metadata?.device_layouts_enabled);
}

export function getDeviceLayoutTrees(
  metadata?: JsonObject | null,
): Partial<Record<DeviceLayoutKey, DashboardLayout>> {
  const stored = (metadata?.device_layouts ?? {}) as JsonObject;
  const trees: Partial<Record<DeviceLayoutKey, DashboardLayout>> = {};
  (['tablet', 'mobile'] as DeviceLayoutKey[]).forEach(device => {
    const tree = stored[device];
    if (tree && typeof tree === 'object' && !Array.isArray(tree)) {
      trees[device] = tree as DashboardLayout;
    }
  });
  return trees;
}

export function resolveActiveLayoutDevice(
  metadata: JsonObject | null | undefined,
  width: number,
): DashboardDevice {
  if (!isDeviceLayoutsEnabled(metadata)) return 'desktop';
  const trees = getDeviceLayoutTrees(metadata);
  const device = resolveDeviceByWidth(width);
  if (device === 'mobile') {
    if (trees.mobile) return 'mobile';
    if (trees.tablet) return 'tablet';
    return 'desktop';
  }
  if (device === 'tablet') {
    return trees.tablet ? 'tablet' : 'desktop';
  }
  return 'desktop';
}

export interface DeviceLayoutsPayloadPieces {
  present: DashboardLayout;
  pastLength: number;
  activeDevice: DashboardDevice;
  inactiveDeviceLayouts: Partial<Record<DashboardDevice, DashboardLayout>>;
  customizedDeviceLayouts: DashboardDevice[];
}

export function buildDeviceLayoutsPayload(
  pieces: DeviceLayoutsPayloadPieces,
): {
  positions: DashboardLayout;
  deviceLayouts?: Partial<Record<DeviceLayoutKey, DashboardLayout>>;
} {
  const {
    present,
    pastLength,
    activeDevice,
    inactiveDeviceLayouts,
    customizedDeviceLayouts,
  } = pieces;
  const treeOf = (device: DashboardDevice): DashboardLayout | undefined =>
    device === activeDevice ? present : inactiveDeviceLayouts[device];
  const customized = new Set<DashboardDevice>(customizedDeviceLayouts);
  if (activeDevice !== 'desktop' && pastLength > 0) {
    customized.add(activeDevice);
  }
  const deviceLayouts: Partial<Record<DeviceLayoutKey, DashboardLayout>> = {};
  (['tablet', 'mobile'] as DeviceLayoutKey[]).forEach(device => {
    const layoutTree = treeOf(device);
    if (customized.has(device) && layoutTree) {
      deviceLayouts[device] = layoutTree;
    }
  });
  return {
    positions: treeOf('desktop') ?? present,
    deviceLayouts: Object.keys(deviceLayouts).length ? deviceLayouts : undefined,
  };
}
```

- [ ] **Step 4: Run tests, verify they pass**

Run: `cd superset-frontend && npm run test -- src/dashboard/util/deviceLayouts.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add superset-frontend/src/dashboard/util/deviceLayouts.ts superset-frontend/src/dashboard/util/deviceLayouts.test.ts
git commit -m "feat(dashboard): device layout resolution utils for per-device versions"
```

---

### Task 2: Backend — sync slices and uuids across device trees

**Files:**
- Modify: `superset/daos/dashboard.py` (`set_dash_metadata` ~line 262, `copy_dashboard` ~line 367)
- Test: `tests/integration_tests/dashboards/dao_tests.py`

**Interfaces:**
- Consumes: frontend save payload puts `positions` and (optionally) `device_layouts` inside `json_metadata` (Task 5).
- Produces: `dashboard.slices` includes charts referenced by any device tree; device trees get `meta.uuid` stamped; `md["device_layouts"]` persisted from the incoming data; stale key removed when a full layout save omits it; `copy_dashboard` remaps `chartId` in device trees when duplicating slices.

- [ ] **Step 1: Write the failing test**

Add to `tests/integration_tests/dashboards/dao_tests.py` (inside `TestDashboardDAO`):

```python
    @pytest.mark.usefixtures("load_world_bank_dashboard_with_slices")
    def test_set_dash_metadata_device_layouts(self):
        dashboard = (
            db.session.query(Dashboard).filter_by(slug="world_health").first()
        )
        original_data = dashboard.data
        original_positions = original_data["position_json"]

        # move one chart to live ONLY in the mobile tree
        chart_nodes = [
            (key, value)
            for key, value in original_positions.items()
            if isinstance(value, dict) and value.get("type") == "CHART"
        ]
        moved_key, moved_node = chart_nodes[0]
        moved_slice_id = moved_node["meta"]["chartId"]

        positions = copy.deepcopy(original_positions)
        del positions[moved_key]
        parent_key = next(
            key
            for key, value in positions.items()
            if isinstance(value, dict) and moved_key in (value.get("children") or [])
        )
        positions[parent_key]["children"].remove(moved_key)

        mobile_tree = copy.deepcopy(original_positions)
        data = {
            "positions": positions,
            "device_layouts": {"mobile": mobile_tree},
            "device_layouts_enabled": True,
        }
        DashboardDAO.set_dash_metadata(dashboard, data)
        db.session.flush()

        # chart missing from desktop but present in mobile stays linked
        linked_ids = {slc.id for slc in dashboard.slices}
        assert moved_slice_id in linked_ids

        md = json.loads(dashboard.json_metadata)
        # device tree persisted and uuid-stamped
        saved_mobile = md["device_layouts"]["mobile"]
        saved_chart = saved_mobile[moved_key]
        assert saved_chart["meta"]["uuid"] is not None
        # positions never leaks into metadata
        assert "positions" not in md

        # a full layout save without device_layouts clears the stored trees
        DashboardDAO.set_dash_metadata(dashboard, {"positions": original_positions})
        db.session.flush()
        md = json.loads(dashboard.json_metadata)
        assert "device_layouts" not in md

        # restore
        DashboardDAO.set_dash_metadata(dashboard, {"positions": original_positions})
        db.session.commit()
```

- [ ] **Step 2: Run test, verify it fails**

Run (inside Docker, per project memory — host has no Python deps):
```bash
docker compose exec superset pytest tests/integration_tests/dashboards/dao_tests.py::TestDashboardDAO::test_set_dash_metadata_device_layouts -x
```
Expected: FAIL — `moved_slice_id in linked_ids` is False (device tree not walked).

- [ ] **Step 3: Implement the backend change**

In `superset/daos/dashboard.py`, add a module-level helper above `class DashboardDAO` (or as a private staticmethod on it):

```python
def _device_layout_trees(data: dict[Any, Any]) -> list[dict[str, Any]]:
    """Layout trees stored under metadata's device_layouts key."""
    device_layouts = data.get("device_layouts") or {}
    if not isinstance(device_layouts, dict):
        return []
    return [tree for tree in device_layouts.values() if isinstance(tree, dict)]
```

In `set_dash_metadata`, replace the `if (positions := data.get("positions")) is not None:` block's slice-id collection and uuid stamping so they walk all trees:

```python
        if (positions := data.get("positions")) is not None:
            all_trees = [positions, *_device_layout_trees(data)]
            # find slices in the position data of every device tree
            slice_ids = [
                value.get("meta", {}).get("chartId")
                for tree in all_trees
                for value in tree.values()
                if isinstance(value, dict)
            ]

            current_slices = (
                db.session.query(Slice).filter(Slice.id.in_(slice_ids)).all()
            )

            dashboard.slices = current_slices

            # add UUID to positions in every tree
            uuid_map = {slice.id: str(slice.uuid) for slice in current_slices}
            for tree in all_trees:
                for obj in tree.values():
                    if (
                        isinstance(obj, dict)
                        and obj["type"] == "CHART"
                        and obj["meta"]["chartId"]
                    ):
                        chart_id = obj["meta"]["chartId"]
                        obj["meta"]["uuid"] = uuid_map.get(chart_id)
```

(The rest of the block — `dashboard.position_json = json.dumps(...)`, filter scopes, default filters, `md.pop("positions", None)` — stays as is; `slice_ids` now naturally includes device-tree charts for the `default_filters` filtering.)

After `md.pop("positions", None)` inside the same `if` block, add persistence of the stamped trees:

```python
            # device trees live in metadata; persist the uuid-stamped copies
            if _device_layout_trees(data):
                md["device_layouts"] = data["device_layouts"]
            else:
                md.pop("device_layouts", None)
```

In `copy_dashboard`, extend the chartId remap loop (currently `for value in metadata["positions"].values():`) to cover device trees:

```python
            # update chartId of layout entities in every device tree
            for tree in [metadata["positions"], *_device_layout_trees(metadata)]:
                for value in tree.values():
                    if isinstance(value, dict) and value.get("meta", {}).get("chartId"):
                        old_id = value["meta"]["chartId"]
                        new_id = old_to_new_slice_ids.get(old_id)
                        value["meta"]["chartId"] = new_id
```

- [ ] **Step 4: Run tests, verify they pass**

```bash
docker compose exec superset pytest tests/integration_tests/dashboards/dao_tests.py -x
```
Expected: PASS, including the pre-existing `test_get_dashboard_changed_on` / `test_copy_dashboard` (regression check).

- [ ] **Step 5: Commit**

```bash
git add superset/daos/dashboard.py tests/integration_tests/dashboards/dao_tests.py
git commit -m "feat(dashboard): sync slices and uuids across device layout trees"
```

---

### Task 3: Redux — active device state and switch action

**Files:**
- Create: `superset-frontend/src/dashboard/actions/deviceLayouts.ts`
- Test: `superset-frontend/src/dashboard/actions/deviceLayouts.test.ts`
- Modify: `superset-frontend/src/dashboard/reducers/dashboardState.ts` (handlers map)
- Modify: `superset-frontend/src/dashboard/reducers/dashboardLayout.ts` (new handler)
- Modify: `superset-frontend/src/dashboard/reducers/undoableDashboardLayout.ts` (TRACKED_ACTIONS)
- Modify: `superset-frontend/src/dashboard/types.ts` (DashboardState fields)

**Interfaces:**
- Consumes: `DashboardDevice` from Task 1; `clearDashboardHistory` from `../actions/dashboardLayout` (existing, wraps redux-undo `clearHistory`).
- Produces:
  - `dashboardState.activeDevice?: DashboardDevice` (absent ⇒ `'desktop'`)
  - `dashboardState.inactiveDeviceLayouts?: Partial<Record<DashboardDevice, DashboardLayout>>`
  - `dashboardState.customizedDeviceLayouts?: DashboardDevice[]`
  - action types `SET_ACTIVE_DEVICE`, `SET_DEVICE_LAYOUT_TREE`
  - thunk `switchActiveDevice(device: DashboardDevice)`

- [ ] **Step 1: Write the failing tests**

```ts
// superset-frontend/src/dashboard/actions/deviceLayouts.test.ts (add ASF header)
import {
  SET_ACTIVE_DEVICE,
  SET_DEVICE_LAYOUT_TREE,
  switchActiveDevice,
} from './deviceLayouts';
import { DashboardLayout } from '../types';

const desktopTree = {
  ROOT_ID: { id: 'ROOT_ID', type: 'ROOT', children: ['GRID_ID'] },
} as unknown as DashboardLayout;
const tabletTree = {
  ROOT_ID: { id: 'ROOT_ID', type: 'ROOT', children: [] },
} as unknown as DashboardLayout;

const makeGetState =
  (overrides: Record<string, unknown> = {}) =>
  () =>
    ({
      dashboardState: { activeDevice: 'desktop', inactiveDeviceLayouts: {}, ...overrides },
      dashboardLayout: { past: [], present: desktopTree, future: [] },
      ...overrides,
    }) as never;

test('switchActiveDevice parks current tree and loads a desktop copy', () => {
  const dispatch = jest.fn();
  switchActiveDevice('tablet')(dispatch, makeGetState());
  const [setActive, setTree, clear] = dispatch.mock.calls.map(call => call[0]);
  expect(setActive).toEqual(
    expect.objectContaining({
      type: SET_ACTIVE_DEVICE,
      device: 'tablet',
      parkedDevice: 'desktop',
      parkedTree: desktopTree,
      parkedTreeWasEdited: false,
    }),
  );
  expect(setTree.type).toBe(SET_DEVICE_LAYOUT_TREE);
  // fresh deep copy of desktop, not the same reference
  expect(setTree.payload.tree).toEqual(desktopTree);
  expect(setTree.payload.tree).not.toBe(desktopTree);
  expect(clear.type).toBe('@@redux-undo/CLEAR_HISTORY');
});

test('switchActiveDevice restores a parked tree as-is', () => {
  const dispatch = jest.fn();
  const getState = () =>
    ({
      dashboardState: {
        activeDevice: 'tablet',
        inactiveDeviceLayouts: { desktop: desktopTree },
      },
      dashboardLayout: { past: [tabletTree], present: tabletTree, future: [] },
    }) as never;
  switchActiveDevice('desktop')(dispatch, getState);
  const [setActive, setTree] = dispatch.mock.calls.map(call => call[0]);
  expect(setActive.parkedTreeWasEdited).toBe(true);
  expect(setTree.payload.tree).toBe(desktopTree);
});

test('switchActiveDevice is a no-op for the same device', () => {
  const dispatch = jest.fn();
  switchActiveDevice('desktop')(dispatch, makeGetState());
  expect(dispatch).not.toHaveBeenCalled();
});
```

- [ ] **Step 2: Run tests, verify they fail**

Run: `cd superset-frontend && npm run test -- src/dashboard/actions/deviceLayouts.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement actions and reducers**

```ts
// superset-frontend/src/dashboard/actions/deviceLayouts.ts (add ASF header)
import { cloneDeep } from 'lodash';
import { Dispatch } from 'redux';
import { clearDashboardHistory } from './dashboardLayout';
import { DashboardDevice } from '../util/deviceLayouts';
import { DashboardLayout, RootState } from '../types';

export const SET_ACTIVE_DEVICE = 'SET_ACTIVE_DEVICE';
export const SET_DEVICE_LAYOUT_TREE = 'SET_DEVICE_LAYOUT_TREE';

export interface SetActiveDeviceAction {
  type: typeof SET_ACTIVE_DEVICE;
  device: DashboardDevice;
  parkedDevice: DashboardDevice;
  parkedTree: DashboardLayout;
  parkedTreeWasEdited: boolean;
}

export interface SetDeviceLayoutTreeAction {
  type: typeof SET_DEVICE_LAYOUT_TREE;
  payload: { tree: DashboardLayout };
}

export function switchActiveDevice(device: DashboardDevice) {
  return (dispatch: Dispatch, getState: () => RootState): void => {
    const { dashboardState, dashboardLayout } = getState();
    const current: DashboardDevice = dashboardState.activeDevice ?? 'desktop';
    if (current === device) return;

    const parked = dashboardState.inactiveDeviceLayouts ?? {};
    const currentTree = dashboardLayout.present;
    const desktopTree = current === 'desktop' ? currentTree : parked.desktop;
    // a device without a stored version starts as a copy of the desktop tree
    const nextTree = parked[device] ?? cloneDeep(desktopTree ?? currentTree);

    dispatch({
      type: SET_ACTIVE_DEVICE,
      device,
      parkedDevice: current,
      parkedTree: currentTree,
      parkedTreeWasEdited: dashboardLayout.past.length > 0,
    } as SetActiveDeviceAction);
    dispatch({
      type: SET_DEVICE_LAYOUT_TREE,
      payload: { tree: nextTree },
    } as SetDeviceLayoutTreeAction);
    dispatch(clearDashboardHistory());
  };
}
```

Note: if `RootState` is not exported from `../types`, use the same state type that `actions/dashboardState.ts` uses for its `GetState` import and mirror that import.

In `superset-frontend/src/dashboard/reducers/dashboardState.ts`, import and add a handler in the `actionHandlers` map (mirror the style of existing handlers):

```ts
import { SET_ACTIVE_DEVICE } from '../actions/deviceLayouts';
// ...
  [SET_ACTIVE_DEVICE](state, action) {
    const inactiveDeviceLayouts = {
      ...state.inactiveDeviceLayouts,
      [action.parkedDevice]: action.parkedTree,
    };
    delete inactiveDeviceLayouts[action.device];
    const customized = new Set(state.customizedDeviceLayouts ?? []);
    if (action.parkedTreeWasEdited) {
      customized.add(action.parkedDevice);
    }
    return {
      ...state,
      activeDevice: action.device,
      inactiveDeviceLayouts,
      customizedDeviceLayouts: Array.from(customized),
    };
  },
```

In `superset-frontend/src/dashboard/reducers/dashboardLayout.ts`, add to `actionHandlers` (import `SET_DEVICE_LAYOUT_TREE` from `../actions/deviceLayouts`):

```ts
  [SET_DEVICE_LAYOUT_TREE](
    state: DashboardLayout,
    action: DashboardLayoutAction,
  ): DashboardLayout {
    const tree = (action.payload as { tree?: DashboardLayout })?.tree ?? {};
    return {
      ...tree,
      // keep the live header (dashboard title) when swapping trees
      ...(state[DASHBOARD_HEADER_ID] && {
        [DASHBOARD_HEADER_ID]: state[DASHBOARD_HEADER_ID],
      }),
    };
  },
```

In `superset-frontend/src/dashboard/reducers/undoableDashboardLayout.ts`, add the action to `TRACKED_ACTIONS` so it passes the layout-only filter (history is cleared right after by the thunk):

```ts
import { SET_DEVICE_LAYOUT_TREE } from '../actions/deviceLayouts';
// ...
const TRACKED_ACTIONS: string[] = [
  HYDRATE_DASHBOARD,
  SET_DEVICE_LAYOUT_TREE,
  // ...existing entries unchanged
];
```

In `superset-frontend/src/dashboard/types.ts`, find the `DashboardState` interface (the one declaring `editMode`) and add:

```ts
  activeDevice?: DashboardDevice;
  inactiveDeviceLayouts?: Partial<Record<DashboardDevice, DashboardLayout>>;
  customizedDeviceLayouts?: DashboardDevice[];
```

with `import { DashboardDevice } from './util/deviceLayouts';` (adjust relative path to match the file location).

- [ ] **Step 4: Run tests, verify they pass**

Run: `cd superset-frontend && npm run test -- src/dashboard/actions/deviceLayouts.test.ts src/dashboard/reducers/dashboardState.test.ts src/dashboard/reducers/dashboardLayout.test.ts`
Expected: PASS (new tests + no regressions in reducer suites).

- [ ] **Step 5: Commit**

```bash
git add superset-frontend/src/dashboard/actions/deviceLayouts.ts superset-frontend/src/dashboard/actions/deviceLayouts.test.ts superset-frontend/src/dashboard/reducers/dashboardState.ts superset-frontend/src/dashboard/reducers/dashboardLayout.ts superset-frontend/src/dashboard/reducers/undoableDashboardLayout.ts superset-frontend/src/dashboard/types.ts
git commit -m "feat(dashboard): redux state and switch action for device layouts"
```

---

### Task 4: Hydrate — resolve the device tree on load

**Files:**
- Modify: `superset-frontend/src/dashboard/actions/hydrate.ts` (~lines 113–131, 190, 370–397)

**Interfaces:**
- Consumes: `isDeviceLayoutsEnabled`, `getDeviceLayoutTrees`, `resolveActiveLayoutDevice`, `DashboardDevice` (Task 1); state fields (Task 3).
- Produces: hydrated `dashboardLayout.present` = resolved device tree; `dashboardState.activeDevice / inactiveDeviceLayouts / customizedDeviceLayouts` seeded.

- [ ] **Step 1: Implement hydrate changes**

Imports to add at the top of `hydrate.ts`:

```ts
import { cloneDeep } from 'lodash';
import {
  DashboardDevice,
  getDeviceLayoutTrees,
  isDeviceLayoutsEnabled,
  resolveActiveLayoutDevice,
} from '../util/deviceLayouts';
```

Replace the layout initialization (currently `const layout = (positionData && ... : getEmptyLayout()) as ...`, lines ~124–131) with:

```ts
    // new dash: position_json could be {} or null
    // getEmptyLayout() includes a version string entry plus BasicLayoutItem entries
    // which lack the `meta` field; layout is mutated below to add full LayoutItem entries
    const desktopLayout = (
      positionData && Object.keys(positionData).length > 0
        ? positionData
        : getEmptyLayout()
    ) as Record<string, LayoutItem | DashboardEntity>;

    const deviceLayoutsEnabled = isDeviceLayoutsEnabled(metadata);
    const deviceTrees = deviceLayoutsEnabled ? getDeviceLayoutTrees(metadata) : {};
    const activeDevice: DashboardDevice = resolveActiveLayoutDevice(
      metadata,
      window.innerWidth,
    );

    const layout =
      activeDevice === 'desktop'
        ? desktopLayout
        : (cloneDeep(deviceTrees[activeDevice]) as Record<
            string,
            LayoutItem | DashboardEntity
          >);

    // chart ids referenced by any tree; a chart absent from every tree was just
    // added from Explore and must be auto-placed, a chart present in another
    // device tree must not leak into this one
    const chartIdsInAnyTree = new Set<number>();
    [desktopLayout, ...Object.values(deviceTrees)].forEach(tree => {
      Object.values(tree).forEach(component => {
        const chartId = (component as LayoutItem).meta?.chartId;
        if (component.type === CHART_TYPE && chartId !== undefined) {
          chartIdsInAnyTree.add(chartId);
        }
      });
    });
```

Change the “newly added slices from explore” condition (line ~190) from
`if (!chartIdToLayoutId[key] && layout[parentId]) {` to:

```ts
      if (!chartIdsInAnyTree.has(key) && layout[parentId]) {
```

Before the final `return dispatch({ type: HYDRATE_DASHBOARD, ... })`, build the parked trees:

```ts
    const inactiveDeviceLayouts: Partial<
      Record<DashboardDevice, Record<string, LayoutItem | DashboardEntity>>
    > = {};
    if (activeDevice !== 'desktop') {
      inactiveDeviceLayouts.desktop = desktopLayout;
    }
    (['tablet', 'mobile'] as const).forEach(device => {
      const tree = deviceTrees[device];
      if (device !== activeDevice && tree) {
        inactiveDeviceLayouts[device] = tree;
      }
    });
```

And extend the `dashboardState` object inside the dispatched data (next to `activeTabs`):

```ts
          activeDevice,
          inactiveDeviceLayouts,
          customizedDeviceLayouts: Object.keys(deviceTrees) as DashboardDevice[],
```

- [ ] **Step 2: Run existing hydrate-adjacent tests**

Run: `cd superset-frontend && npm run test -- src/dashboard/actions/dashboardState.test.ts src/dashboard/reducers/dashboardState.test.ts`
Expected: PASS (no regressions; hydrate has no dedicated test file — viewer resolution is covered by Task 1 unit tests and Task 10 manual verification).

- [ ] **Step 3: Typecheck the touched area**

Run: `cd superset-frontend && npx tsc --noEmit -p . 2>&1 | grep -E "hydrate|deviceLayouts" || echo OK`
Expected: `OK` (no new type errors in the touched files).

- [ ] **Step 4: Commit**

```bash
git add superset-frontend/src/dashboard/actions/hydrate.ts
git commit -m "feat(dashboard): hydrate resolves device layout tree by viewport width"
```

---

### Task 5: Save — desktop positions plus customized device trees

**Files:**
- Create: `superset-frontend/src/dashboard/hooks/useDeviceLayoutsPayload.ts`
- Modify: `superset-frontend/src/dashboard/components/Header/index.tsx` (`overwriteDashboard`, ~line 430)
- Modify: `superset-frontend/src/dashboard/components/SaveModal.tsx` (`saveDashboard`, ~line 107)

**Interfaces:**
- Consumes: `buildDeviceLayoutsPayload`, `isDeviceLayoutsEnabled` (Task 1); state fields (Task 3).
- Produces: hook `useDeviceLayoutsPayload(): { positions: DashboardLayout; deviceLayouts?: Partial<Record<DeviceLayoutKey, DashboardLayout>> }` used by both save entry points.

- [ ] **Step 1: Implement the hook**

```ts
// superset-frontend/src/dashboard/hooks/useDeviceLayoutsPayload.ts (add ASF header)
import { useMemo } from 'react';
import { shallowEqual, useSelector } from 'react-redux';
import {
  buildDeviceLayoutsPayload,
  DashboardDevice,
} from '../util/deviceLayouts';
import { DashboardLayout, RootState } from '../types';

export function useDeviceLayoutsPayload() {
  const pieces = useSelector(
    (state: RootState) => ({
      present: state.dashboardLayout.present,
      pastLength: state.dashboardLayout.past.length,
      activeDevice: (state.dashboardState.activeDevice ??
        'desktop') as DashboardDevice,
      inactiveDeviceLayouts: (state.dashboardState.inactiveDeviceLayouts ??
        {}) as Partial<Record<DashboardDevice, DashboardLayout>>,
      customizedDeviceLayouts: (state.dashboardState.customizedDeviceLayouts ??
        []) as DashboardDevice[],
    }),
    shallowEqual,
  );
  return useMemo(() => buildDeviceLayoutsPayload(pieces), [pieces]);
}
```

(If `RootState` in `../types` lacks `dashboardLayout`, use the same root-state type Header's `useSelector` uses — `HeaderRootState`-style — or type the selector parameter the way `components/Header/index.tsx` does.)

- [ ] **Step 2: Wire Header.overwriteDashboard**

In `superset-frontend/src/dashboard/components/Header/index.tsx`:

```ts
import { useDeviceLayoutsPayload } from 'src/dashboard/hooks/useDeviceLayoutsPayload';
import { isDeviceLayoutsEnabled } from 'src/dashboard/util/deviceLayouts';
```

Inside the component body (near other hooks): `const deviceLayoutsPayload = useDeviceLayoutsPayload();`

In `overwriteDashboard` change the `metadata` block from `positions: layout,` to:

```ts
      metadata: {
        ...dashboardInfo?.metadata,
        color_namespace: currentColorNamespace,
        color_scheme: currentColorScheme,
        positions: deviceLayoutsPayload.positions,
        ...(isDeviceLayoutsEnabled(dashboardInfo?.metadata) && {
          device_layouts: deviceLayoutsPayload.deviceLayouts,
        }),
        refresh_frequency: shouldPersistRefreshFrequency
          ? refreshFrequency
          : dashboardInfo.metadata?.refresh_frequency,
      },
```

Also change the size-limit check to measure the desktop tree:
`const positionJSONLength = safeStringify(deviceLayoutsPayload.positions).length;`
Add `deviceLayoutsPayload` to the `useCallback` dependency array of `overwriteDashboard`.

Note: when the feature flag is off, the spread of `dashboardInfo?.metadata` intentionally preserves any previously stored `device_layouts` untouched.

- [ ] **Step 3: Wire SaveModal (Save As / copy)**

In `superset-frontend/src/dashboard/components/SaveModal.tsx`, add the same two imports, call `const deviceLayoutsPayload = useDeviceLayoutsPayload();` in the component body, and in `saveDashboard` change the `metadata` block from `positions: layout,` to:

```ts
      metadata: {
        ...dashboardInfo?.metadata,
        positions: deviceLayoutsPayload.positions,
        ...(isDeviceLayoutsEnabled(dashboardInfo?.metadata) && {
          device_layouts: deviceLayoutsPayload.deviceLayouts,
        }),
        refresh_frequency: refreshFrequencyToUse,
      },
```

The now-unused `layout` prop of SaveModal: leave the prop in place (other props destructure positionally is not an issue), but remove its usage only — do not change the component's public props in this task.

- [ ] **Step 4: Run tests and typecheck**

Run: `cd superset-frontend && npm run test -- src/dashboard/components/SaveModal.test.tsx src/dashboard/components/Header`
Expected: PASS (existing suites; if a Header/SaveModal test asserts `positions: layout`, update the test store to include `dashboardState.activeDevice: 'desktop'` — payload equals the old behavior when no device versions exist).

- [ ] **Step 5: Commit**

```bash
git add superset-frontend/src/dashboard/hooks/useDeviceLayoutsPayload.ts superset-frontend/src/dashboard/components/Header/index.tsx superset-frontend/src/dashboard/components/SaveModal.tsx
git commit -m "feat(dashboard): save desktop positions and customized device trees"
```

---

### Task 6: Properties modal — opt-in checkbox

**Files:**
- Modify: `superset-frontend/src/dashboard/components/PropertiesModal/index.tsx` (mirror the `show_chart_timestamps` pattern exactly: lines ~134, ~204–214, ~352, ~766)
- Modify: `superset-frontend/src/dashboard/components/PropertiesModal/sections/StylingSection.tsx` (checkbox render, ~line 207 area)

**Interfaces:**
- Produces: `json_metadata.device_layouts_enabled: boolean` round-trips through the modal; existing `onSubmit` → Header `handleOnPropertiesChange` → `dashboardInfoChanged` propagates the flag into `dashboardInfo.metadata` without extra wiring.

- [ ] **Step 1: Implement, mirroring `show_chart_timestamps`**

In `PropertiesModal/index.tsx`:
1. State: `const [deviceLayoutsEnabled, setDeviceLayoutsEnabled] = useState(false);` next to `showChartTimestamps` (~line 134).
2. In `handleDashboardData`: add `'device_layouts_enabled'` to the `omit(metadata, [...])` list (~line 204) and `setDeviceLayoutsEnabled(metadata?.device_layouts_enabled ?? false);` next to `setShowChartTimestamps` (~line 214). Do NOT omit `device_layouts` itself — the trees must stay visible/round-trip in the advanced JSON editor.
3. In the submit handler next to `jsonMetadataObj.show_chart_timestamps = ...` (~line 352): `jsonMetadataObj.device_layouts_enabled = Boolean(deviceLayoutsEnabled);`
4. Pass to the section (~line 766): `deviceLayoutsEnabled={deviceLayoutsEnabled}` and `onDeviceLayoutsEnabledChange={setDeviceLayoutsEnabled}`.

In `sections/StylingSection.tsx`, add the two props to the props interface (mirror `showChartTimestamps: boolean;` and `onShowChartTimestampsChange`), and render next to the existing timestamps checkbox (same component type):

```tsx
        <Checkbox
          checked={deviceLayoutsEnabled}
          onChange={e => onDeviceLayoutsEnabledChange(e.target.checked)}
          data-test="device-layouts-enabled-checkbox"
        >
          {t('Adaptive versions (desktop/tablet/mobile)')}
        </Checkbox>
```

(Use exactly the same checkbox component/import that the `showChartTimestamps` checkbox at ~line 207 uses, with the same wrapper markup/help-text pattern.)

- [ ] **Step 2: Run tests**

Run: `cd superset-frontend && npm run test -- src/dashboard/components/PropertiesModal`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add superset-frontend/src/dashboard/components/PropertiesModal/
git commit -m "feat(dashboard): properties checkbox to enable adaptive device versions"
```

---

### Task 7: Device switcher in the edit-mode header

**Files:**
- Create: `superset-frontend/src/dashboard/components/Header/DeviceLayoutSwitcher.tsx`
- Test: `superset-frontend/src/dashboard/components/Header/DeviceLayoutSwitcher.test.tsx`
- Modify: `superset-frontend/src/dashboard/components/Header/index.tsx` (edit-mode block, ~line 673)

**Interfaces:**
- Consumes: `switchActiveDevice` (Task 3), `isDeviceLayoutsEnabled` (Task 1), `Radio`, `Tooltip`, `Icons` from `@superset-ui/core/components`.
- Produces: self-contained connected component `<DeviceLayoutSwitcher />` (no props).

- [ ] **Step 1: Write the failing test**

```tsx
// superset-frontend/src/dashboard/components/Header/DeviceLayoutSwitcher.test.tsx (add ASF header)
import { render, screen, fireEvent } from 'spec/helpers/testing-library';
import DeviceLayoutSwitcher from './DeviceLayoutSwitcher';

const initialState = {
  dashboardInfo: { metadata: { device_layouts_enabled: true } },
  dashboardState: { activeDevice: 'desktop' },
  dashboardLayout: { past: [], present: {}, future: [] },
};

test('renders three device options and dispatches switch on click', () => {
  const { store } = render(<DeviceLayoutSwitcher />, {
    useRedux: true,
    initialState,
  });
  expect(screen.getByRole('radio', { name: /desktop/i })).toBeChecked();
  fireEvent.click(screen.getByRole('radio', { name: /mobile/i }));
  const actions = store.getActions?.() ?? [];
  // switch thunk runs against the real store in testing-library helper;
  // assert via state when getActions is unavailable
  expect(
    actions.some?.((a: { type: string }) => a.type === 'SET_ACTIVE_DEVICE') ??
      store.getState().dashboardState.activeDevice === 'mobile',
  ).toBe(true);
});

test('renders nothing when the dashboard flag is off', () => {
  const { container } = render(<DeviceLayoutSwitcher />, {
    useRedux: true,
    initialState: {
      ...initialState,
      dashboardInfo: { metadata: {} },
    },
  });
  expect(container).toBeEmptyDOMElement();
});
```

- [ ] **Step 2: Run test, verify it fails**

Run: `cd superset-frontend && npm run test -- src/dashboard/components/Header/DeviceLayoutSwitcher.test.tsx`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the component**

```tsx
// superset-frontend/src/dashboard/components/Header/DeviceLayoutSwitcher.tsx (add ASF header)
import { useCallback } from 'react';
import { shallowEqual, useDispatch, useSelector } from 'react-redux';
import { t, JsonObject } from '@superset-ui/core';
import { Radio, Tooltip } from '@superset-ui/core/components';
import { switchActiveDevice } from 'src/dashboard/actions/deviceLayouts';
import {
  DashboardDevice,
  isDeviceLayoutsEnabled,
} from 'src/dashboard/util/deviceLayouts';

interface DeviceSwitcherState {
  dashboardInfo: { metadata?: JsonObject };
  dashboardState: { activeDevice?: DashboardDevice };
}

const DEVICE_OPTIONS: { value: DashboardDevice; label: string }[] = [
  { value: 'desktop', label: t('Desktop') },
  { value: 'tablet', label: t('Tablet') },
  { value: 'mobile', label: t('Mobile') },
];

export default function DeviceLayoutSwitcher() {
  const dispatch = useDispatch();
  const { enabled, activeDevice } = useSelector(
    (state: DeviceSwitcherState) => ({
      enabled: isDeviceLayoutsEnabled(state.dashboardInfo?.metadata),
      activeDevice: state.dashboardState.activeDevice ?? 'desktop',
    }),
    shallowEqual,
  );
  const handleChange = useCallback(
    (event: { target: { value: DashboardDevice } }) => {
      dispatch(switchActiveDevice(event.target.value));
    },
    [dispatch],
  );

  if (!enabled) return null;

  return (
    <Tooltip
      id="device-layout-switcher-tooltip"
      title={t('Edit the dashboard version for a specific device')}
    >
      <Radio.Group
        value={activeDevice}
        onChange={handleChange}
        size="small"
        data-test="device-layout-switcher"
      >
        {DEVICE_OPTIONS.map(({ value, label }) => (
          <Radio.Button key={value} value={value}>
            {label}
          </Radio.Button>
        ))}
      </Radio.Group>
    </Tooltip>
  );
}
```

(If `Radio.Button` is not exported by the ui-core `Radio` wrapper, check `superset-frontend/packages/superset-ui-core/src/components/Radio/index.tsx` and use its documented button-group variant — e.g. `Radio.GroupWrapper` with `options` — keeping the same `value`/`onChange` contract. Adjust the test queries accordingly.)

- [ ] **Step 4: Mount in Header**

In `components/Header/index.tsx`, `import DeviceLayoutSwitcher from './DeviceLayoutSwitcher';` and render it first inside the edit-mode block (~line 674, inside `<div css={actionButtonsStyle}>`, before `<div className="undoRedo">`):

```tsx
              <div css={actionButtonsStyle}>
                <DeviceLayoutSwitcher />
                <div className="undoRedo">
```

- [ ] **Step 5: Run tests, verify they pass**

Run: `cd superset-frontend && npm run test -- src/dashboard/components/Header/DeviceLayoutSwitcher.test.tsx`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add superset-frontend/src/dashboard/components/Header/DeviceLayoutSwitcher.tsx superset-frontend/src/dashboard/components/Header/DeviceLayoutSwitcher.test.tsx superset-frontend/src/dashboard/components/Header/index.tsx
git commit -m "feat(dashboard): device switcher in edit-mode header"
```

---

### Task 8: Edit canvas width preview

**Files:**
- Modify: `superset-frontend/src/dashboard/components/DashboardBuilder/DashboardContainer.tsx` (root div, ~line 377)

**Interfaces:**
- Consumes: `DEVICE_EDIT_CANVAS_WIDTH`, `DashboardDevice` (Task 1); `dashboardState.activeDevice`, `dashboardState.editMode`.

- [ ] **Step 1: Implement the constraint**

Add imports and selectors (the file already uses `useSelector<RootState, ...>`):

```ts
import {
  DashboardDevice,
  DEVICE_EDIT_CANVAS_WIDTH,
} from 'src/dashboard/util/deviceLayouts';
// inside the component:
const editMode = useSelector<RootState, boolean>(
  state => !!state.dashboardState.editMode,
);
const activeDevice = useSelector<RootState, DashboardDevice>(
  state => state.dashboardState.activeDevice ?? 'desktop',
);
const editCanvasWidth =
  editMode && activeDevice !== 'desktop'
    ? DEVICE_EDIT_CANVAS_WIDTH[activeDevice]
    : undefined;
```

Change the root element:

```tsx
    <div
      className="grid-container"
      data-test="grid-container"
      style={
        editCanvasWidth
          ? { width: editCanvasWidth, maxWidth: '100%', margin: '0 auto' }
          : undefined
      }
    >
```

`ParentSize` inside measures the constrained container, so `DashboardGrid` column widths and charts scale automatically; view mode is untouched (`editMode` guard).

- [ ] **Step 2: Run adjacent tests**

Run: `cd superset-frontend && npm run test -- src/dashboard/components/DashboardBuilder/DashboardContainer.test.tsx`
Expected: PASS (if no such test file exists, run `npm run test -- src/dashboard/components/DashboardBuilder` and expect PASS).

- [ ] **Step 3: Commit**

```bash
git add superset-frontend/src/dashboard/components/DashboardBuilder/DashboardContainer.tsx
git commit -m "feat(dashboard): constrain edit canvas to device width for preview"
```

---

### Task 9: Viewer auto-switch on resize/rotation

**Files:**
- Create: `superset-frontend/src/dashboard/hooks/useDeviceLayoutAutoSwitch.ts`
- Modify: `superset-frontend/src/dashboard/components/DashboardBuilder/DashboardContainer.tsx` (call the hook)

**Interfaces:**
- Consumes: `resolveActiveLayoutDevice`, `isDeviceLayoutsEnabled` (Task 1); `switchActiveDevice` (Task 3).
- Produces: `useDeviceLayoutAutoSwitch(): void` — view-mode-only, debounced.

- [ ] **Step 1: Implement the hook**

```ts
// superset-frontend/src/dashboard/hooks/useDeviceLayoutAutoSwitch.ts (add ASF header)
import { useEffect } from 'react';
import { debounce } from 'lodash';
import { shallowEqual, useDispatch, useSelector } from 'react-redux';
import { JsonObject } from '@superset-ui/core';
import { switchActiveDevice } from '../actions/deviceLayouts';
import {
  DashboardDevice,
  isDeviceLayoutsEnabled,
  resolveActiveLayoutDevice,
} from '../util/deviceLayouts';

interface AutoSwitchState {
  dashboardInfo: { metadata?: JsonObject };
  dashboardState: { editMode?: boolean; activeDevice?: DashboardDevice };
}

const RESIZE_DEBOUNCE_MS = 300;

export function useDeviceLayoutAutoSwitch(): void {
  const dispatch = useDispatch();
  const { metadata, editMode, activeDevice } = useSelector(
    (state: AutoSwitchState) => ({
      metadata: state.dashboardInfo?.metadata,
      editMode: !!state.dashboardState.editMode,
      activeDevice: state.dashboardState.activeDevice ?? 'desktop',
    }),
    shallowEqual,
  );

  useEffect(() => {
    // auto-switching only makes sense for viewers of adaptive dashboards
    if (editMode || !isDeviceLayoutsEnabled(metadata)) return undefined;
    const handleResize = debounce(() => {
      const nextDevice = resolveActiveLayoutDevice(metadata, window.innerWidth);
      if (nextDevice !== activeDevice) {
        dispatch(switchActiveDevice(nextDevice));
      }
    }, RESIZE_DEBOUNCE_MS);
    window.addEventListener('resize', handleResize);
    return () => {
      handleResize.cancel();
      window.removeEventListener('resize', handleResize);
    };
  }, [dispatch, editMode, metadata, activeDevice]);
}
```

- [ ] **Step 2: Call it in DashboardContainer**

In `DashboardContainer.tsx` component body (it already has `editMode`/`activeDevice` selectors from Task 8):

```ts
import { useDeviceLayoutAutoSwitch } from 'src/dashboard/hooks/useDeviceLayoutAutoSwitch';
// inside the component, alongside other hooks:
useDeviceLayoutAutoSwitch();
```

- [ ] **Step 3: Typecheck and adjacent tests**

Run: `cd superset-frontend && npm run test -- src/dashboard/components/DashboardBuilder && npx tsc --noEmit -p . 2>&1 | grep -E "useDeviceLayoutAutoSwitch|DashboardContainer" || echo OK`
Expected: tests PASS, `OK`.

- [ ] **Step 4: Commit**

```bash
git add superset-frontend/src/dashboard/hooks/useDeviceLayoutAutoSwitch.ts superset-frontend/src/dashboard/components/DashboardBuilder/DashboardContainer.tsx
git commit -m "feat(dashboard): auto-switch device layout on viewport resize in view mode"
```

---

### Task 10: Validation — lint, full targeted test run, manual verification

**Files:**
- No new files; fixes only if checks fail.

- [ ] **Step 1: Frontend lint + prettier on changed files**

```bash
cd superset-frontend
npx eslint src/dashboard/util/deviceLayouts.ts src/dashboard/actions/deviceLayouts.ts src/dashboard/hooks/useDeviceLayoutsPayload.ts src/dashboard/hooks/useDeviceLayoutAutoSwitch.ts src/dashboard/components/Header/DeviceLayoutSwitcher.tsx --fix
npx prettier --write 'src/dashboard/**/*.{ts,tsx}' --log-level warn
```
Expected: no errors (warnings acceptable if pre-existing).

- [ ] **Step 2: Full targeted Jest run**

```bash
cd superset-frontend && npm run test -- src/dashboard/util/deviceLayouts.test.ts src/dashboard/actions/deviceLayouts.test.ts src/dashboard/components/Header/DeviceLayoutSwitcher.test.tsx src/dashboard/reducers src/dashboard/actions/dashboardState.test.ts src/dashboard/components/PropertiesModal src/dashboard/components/SaveModal.test.tsx
```
Expected: PASS.

- [ ] **Step 3: Backend test run in Docker**

```bash
docker compose exec superset pytest tests/integration_tests/dashboards/dao_tests.py
```
Expected: PASS.

- [ ] **Step 4: Manual verification (superpowers:verification-before-completion)**

With the dev stack running (`docker compose up` + `npm run dev` per project setup):
1. Open a dashboard → Properties → enable “Adaptive versions” → Save. Switcher appears in edit mode.
2. Switch to Mobile → canvas narrows to 375px with a copy of desktop → delete a chart, add another, save.
3. Reload at width < 768px (devtools device emulation) → mobile version renders; at ≥ 1024px → desktop intact.
4. Resize the window across 768px in view mode → layout swaps live.
5. Disable the checkbox → narrow viewport shows desktop layout again; re-enable → mobile version returns (data preserved).
6. Chart added only to mobile loads correctly for viewers (backend slice sync).

- [ ] **Step 5: Pre-commit and final commit**

```bash
git add -A && pre-commit run || true   # stage, run hooks, restage auto-fixes
git add -A
git commit -m "chore(dashboard): lint/format fixes for device layouts" --allow-empty
```
(Skip the commit if there is nothing to commit. Do not add Co-Authored-By.)
