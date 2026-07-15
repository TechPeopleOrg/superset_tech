# Design: Device-Specific Dashboard Layouts (Desktop / Tablet / Mobile)

**Date:** 2026-07-14
**Branch:** `feat/device-dashboard-layouts` (from `techpeople_master`)
**Status:** Approved design, pending implementation plan

## Problem

A Superset dashboard has a single layout (`dashboards.position_json`). On tablets and
phones the desktop layout is merely squeezed, which produces poor results. Editors need
to author distinct layouts per device class — different widgets, different arrangement —
and viewers must automatically receive the version matching their device.

## Requirements (validated with user)

1. **Opt-in per dashboard.** A checkbox in dashboard Properties ("Адаптивные версии
   (ПК/планшет/телефон)") enables the feature for that dashboard. While disabled, the
   device switcher is hidden in edit mode and viewers always get the desktop layout,
   even if device layouts were authored earlier (data is kept, not applied).
2. **Three versions:** desktop, tablet, mobile. Widget sets are **fully independent** —
   each version may contain any subset/superset of charts, markdown, tabs, etc. The
   chart pool (slices attached to the dashboard) is shared.
3. **Editing:** a Desktop / Tablet / Mobile segmented switcher in the edit-mode header.
   Switching changes which layout tree is being edited. The canvas narrows to the
   device width so the editor sees a realistic preview.
4. **Fallback:** until a device version is customized, viewers on that device get the
   desktop layout (current behavior). Only customized versions are persisted.
5. **Viewing:** version is selected automatically by viewport width. No manual switcher
   for viewers in the MVP.

## Architecture (chosen: Option A — trees in metadata)

Considered options:

- **A. Layout trees in `json_metadata` (chosen).** Desktop stays in `position_json`
  (full backward compatibility); tablet/mobile trees live in
  `json_metadata.device_layouts`. No DB migration; export/import, dashboard copy,
  embedded SDK, and permissions work unchanged because metadata already round-trips
  through all of those. Minimal divergence from upstream Superset (this repo is a fork
  that merges upstream regularly).
- **B. Separate table `dashboard_device_layouts` + REST API.** Cleaner relational
  model, lazy loading — but requires a migration, new endpoints, export/import and
  copy support, and is much heavier to maintain against upstream. Rejected for MVP.
- **C. Three linked dashboards with device redirect.** Triples permissions, filters,
  ownership, and links; breaks sharing. Rejected.

## Data model

`dashboards.position_json` — desktop tree, unchanged format.

`dashboards.json_metadata` gains two keys:

```jsonc
{
  "device_layouts_enabled": true,          // the Properties checkbox
  "device_layouts": {
    "tablet": { /* position_json-format tree */ },   // present only if customized
    "mobile": { /* position_json-format tree */ }
  }
}
```

Breakpoints (single constants module, shared by editor and viewer):

| Device  | Viewport width | Edit canvas width |
|---------|----------------|-------------------|
| mobile  | `< 768px`      | 375px             |
| tablet  | `768–1024px`   | 768px             |
| desktop | `> 1024px`     | full width        |

Version resolution cascade for viewers (only when `device_layouts_enabled`):
`mobile → tablet → desktop` on phones; `tablet → desktop` on tablets; desktop
otherwise.

## Backend change (single, targeted)

On dashboard save, Superset synchronizes the `dashboard_slices` association from chart
ids found in `position_json`. A chart present **only** in a tablet/mobile tree must
also be linked, otherwise it will not load for viewers. Change: the slice-id extraction
used by the dashboard update path also walks the trees under
`metadata.device_layouts`. Covered by pytest. No other backend changes (no new API, no
migration, no permission changes).

## Frontend: editor

- **Device switcher** (segmented control: ПК / Планшет / Телефон, antd icons via
  `@superset-ui/core` wrappers) rendered in the edit-mode header bar, only when
  `device_layouts_enabled` is true.
- **Properties modal**: new checkbox writing `device_layouts_enabled` into metadata.
- **Redux shape.** `dashboardState.activeDevice: 'desktop' | 'tablet' | 'mobile'`
  (default `desktop`). The existing undoable `dashboardLayout` slice **always holds the
  active tree**, so every existing consumer (grid, DnD, SliceAdder, resize, delete)
  keeps working untouched. Inactive trees are parked in a new
  `inactiveDeviceLayouts` map. Switching devices: park current tree → load target tree
  → reset undo history (MVP limitation).
- **First switch to an uncustomized device** loads a deep copy of the desktop tree as
  the starting point (component ids preserved — trees are independent maps, so
  duplicate ids across trees are fine and keep tab anchors working).
- **Customization tracking.** A per-device `customized` flag flips when any
  layout-mutating action fires while that device is active. On save, only customized
  (or previously persisted) trees are written to `metadata.device_layouts`; an
  untouched copy is discarded so the viewer fallback stays "desktop".
- **Canvas preview.** When tablet/mobile is active in edit mode, the grid container is
  constrained to the canvas width above and centered. The 12-column grid needs no
  changes — column width is already computed from container width.
- **Save.** `positions` in the save payload is always the desktop tree (pulled from the
  parked store when a non-desktop device is active); `metadata.device_layouts` carries
  the customized versions; `metadata.device_layouts_enabled` carries the checkbox.

## Frontend: viewer

- `hydrate.ts` resolves the initial tree via the cascade above using
  `window.innerWidth`.
- In **view mode only**, a debounced resize listener swaps the layout tree when the
  viewport crosses a breakpoint (covers rotation and window resize). No auto-switching
  in edit mode.
- Native filters are shared across versions. A filter whose scope references charts
  absent from the active tree simply has no effect there.
- Embedded SDK dashboards get the same width-based resolution (iframe width).

## MVP limitations (accepted)

- Undo/redo history resets when switching devices in the editor.
- The native-filter scope configuration UI shows the desktop tree.
- Tab anchor links work while ids are shared with the desktop copy; for fully rebuilt
  device trees they are best effort.
- Trees for all customized devices load with the dashboard (no lazy loading).

## Testing

- **Jest** (`npm run test`): device-switch reducer logic (park/restore, history reset,
  customized flag), breakpoint resolution util (cascade + enabled flag), save payload
  (desktop always in `positions`, only customized trees in metadata).
- **Pytest** (run inside the `superset_tech-superset` Docker image): slice-id sync
  includes charts from `device_layouts` trees; untouched update path unaffected when
  metadata has no device keys.
- Manual verification: author distinct desktop/tablet/mobile versions, view at three
  viewport widths, toggle the Properties checkbox off and confirm desktop-only
  behavior.
