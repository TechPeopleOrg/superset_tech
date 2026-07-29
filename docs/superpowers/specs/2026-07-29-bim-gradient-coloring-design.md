# BIM viewer — numeric gradient coloring (design)

**Date:** 2026-07-29
**Plugin:** `superset-frontend/plugins/plugin-chart-bim`
**Status:** design, approved to implement

## Problem

The BIM chart colors model elements by mapping a dataset column value to a color
via a **categorical** palette (`colorMapping.ts` → `colorFn(value)`). This is
right for discrete values (status, contractor, critical path), but wrong for
**numeric** columns: `percent_complete`, `act_cost`, `total_float_days` each get
one arbitrary palette color per distinct number, which is meaningless.

We want to color numeric columns with a continuous **sequential** gradient
(min → max), with a gradient legend, so "% complete", "cost", etc. read as a
heat scale on the model.

## Scope (first version)

- Sequential gradients only. (Diverging −/0/+ is deferred.)
- Explicit mode switch in chart settings: `Categories` (default) / `Gradient`.
- A small set of built-in, curated sequential scales to choose from.
- Scale bounds: auto from data by default, with optional manual min/max override.
- Categorical coloring path is unchanged.

Out of scope: diverging scales, per-value legend ticks beyond min/max, 4D
timeline, runtime scale switching in the viewer toolbar.

## Invariant: model- and dataset-agnostic (no hardcoding)

The feature must work for **any** model and **any** numeric column — nothing
about a specific model, project, or the P6 dataset may be baked in.

- The colored column is whatever the user selects in `color_by`; never a
  hardcoded column name.
- Bounds come from the actual data (or explicit user min/max); never assumed
  ranges like "0–100 because it's a percentage". A column of costs, days, or
  any other unit works identically.
- Gradient scales carry no domain meaning (no "green = done"). They are generic
  low→high color ramps chosen by the user.
- Number parsing is generic (`Number(raw)`), not tied to any P6 format,
  locale, or unit.
- The element↔row link is via the user-selected GlobalId column, already
  model-agnostic.

If any step would need to know "which model" or "which project" this is, that is
a bug in the design.

## Approach

Branch on a color **mode** inside `buildColorMapping`. The categorical branch is
the existing code untouched. The gradient branch parses the column value as a
number, normalizes it against the scale bounds, and samples a curated gradient.
The output stays the same `colorById: Map<id, [r,g,b]>`, so the paint effect in
`BimChart` and `api.colorize` need no changes. The legend result gains a
gradient shape that `ColorLegend` renders as a bar with min/max labels.

## Components

### New: `gradientScales.ts`

Self-contained, no external deps.

- `GRADIENT_SCALES`: an ordered list of curated sequential scales, each
  `{ id, label, stops: string[] /* #rrggbb, low→high */ }`. Start with ~4:
  e.g. `grey-green` (grey→green, the "progress" default), `blue`, `warm`
  (grey→amber→red-ish), and a `viridis`-like perceptual scale.
- `sampleScale(scaleId, t): [number, number, number]` — clamp `t` to [0,1],
  find the bracketing stops, linearly interpolate in 0..1 rgb. Same math already
  validated in the mockup.
- `scaleCssGradient(scaleId): string` — a `linear-gradient(90deg, …stops)`
  string for the legend bar. Keeps the legend and the model visually consistent.
- Unknown `scaleId` falls back to the first scale (never throws).

### Changed: `colorMapping.ts`

New input fields on `ColorMappingInput`:

- `mode: 'categorical' | 'gradient'` (default `'categorical'`)
- `gradientScaleId?: string`
- `gradientMin?: number` / `gradientMax?: number` (manual overrides; undefined = auto)

Behavior:

- `mode === 'categorical'` → existing code path, unchanged.
- `mode === 'gradient'`:
  1. For each row, parse `row[colorBy]` as a number. Non-numeric / null / empty
     rows are skipped (element stays "no data", exactly like an unmatched id).
     Use a strict parse (`Number(raw)`, reject `NaN`).
  2. Determine bounds: `min = gradientMin ?? dataMin`, `max = gradientMax ?? dataMax`.
     Compute `dataMin`/`dataMax` from the parsed numeric values only.
  3. Degenerate range (`max <= min`, e.g. all equal or a single value): every
     matched element maps to the scale's midpoint color (`t = 0.5`). No divide
     by zero.
  4. `t = clamp((v - min) / (max - min), 0, 1)`; `rgb = sampleScale(scaleId, t)`.
  5. `colorById.set(id, rgb)`.

Legend result: `ColorMappingResult` gains an optional discriminated shape.
Instead of always returning `legend: {value,color}[]`, return either:

- categorical: `{ kind: 'categorical', items: {value,color}[] }`
- gradient: `{ kind: 'gradient', scaleId, min, max }`

(Concretely: keep `legend` as a union so callers switch on `kind`. The existing
`stats.dataKeys` and `colorById` stay.)

### Changed: `ColorLegend.tsx`

Render by `legend.kind`:

- `categorical` → the current chip list (unchanged).
- `gradient` → a horizontal bar filled with `scaleCssGradient(scaleId)`, with the
  numeric `min` (left) and `max` (right) below it, formatted compactly. Same
  floating container, same theme tokens.

### Changed: `controlPanel.tsx` (section "Data binding")

Add after `color_by`:

- `color_mode` — `SelectControl`, `Категории` / `Градиент`, default `categorical`,
  `renderTrigger: true`. (Visibility: shown always; only meaningful with
  `color_by` set. A `visibility` predicate can hide it until `color_by` is set —
  nice-to-have.)
- `gradient_scale` — `SelectControl`, choices from `GRADIENT_SCALES`
  (`[id, label]`), default the first scale id, `renderTrigger: true`. Visible
  only when `color_mode === 'gradient'` (via `visibility`).
- `gradient_min` / `gradient_max` — two `TextControl` (numeric-ish), empty =
  auto, `renderTrigger: true`. Visible only in gradient mode.

### Changed: `transformProps.ts` & `types.ts`

- Read new formData fields (both snake_case and camelCase, per existing pattern):
  `color_mode`, `gradient_scale`, `gradient_min`, `gradient_max`.
- Parse min/max: empty string → `undefined`; otherwise `Number`, and if `NaN`
  treat as `undefined` (fall back to auto).
- Pass `mode`, `gradientScaleId`, `gradientMin`, `gradientMax` into `BimChartProps`
  and through to `buildColorMapping` in `BimChart`.
- `BimChart` must include the new fields in its `mappingKey` memo (the content
  key that gates recompute), so switching mode/scale/bounds repaints.

### Unchanged

Paint effect in `BimChart`, cross-filters, model tree, viewer toolbar,
`api.colorize`, the categorical coloring path.

## Data flow

```
dataset row --> transformProps (mode, scaleId, min, max, colorBy, linkColumn)
            --> BimChart mappingKey memo
            --> buildColorMapping
                  categorical: colorFn(value)        (unchanged)
                  gradient:    sampleScale(id, t(v))  (new)
            --> colorById: Map<globalId, rgb>
            --> paint effect -> api.colorize          (unchanged)
            --> legend {kind} -> ColorLegend          (branch on kind)
```

## Error handling

- Non-numeric values in gradient mode: skipped, element reads as "no data".
- `max <= min`: midpoint color, no divide-by-zero.
- Unknown `gradientScaleId`: falls back to first scale.
- Manual min/max that are non-numeric: ignored (auto used).
- Manual min > max: treat as given (t clamps), but that inverts intent; acceptable
  for v1 — document, don't guard.

## Testing

- `gradientScales`: interpolation at t=0/0.5/1, clamping below 0 / above 1,
  bracketing between stops, unknown id falls back, css gradient string shape.
- `colorMapping` gradient branch: auto min/max from data; manual override;
  non-numeric rows skipped; degenerate range → midpoint; a mid value maps to an
  interior color; categorical path still returns `kind: 'categorical'`.
- `ColorLegend`: gradient shape renders a bar + min/max labels; categorical shape
  still renders chips.

## Files touched

- new: `src/gradientScales.ts`, `test/gradientScales.test.ts`
- changed: `src/colorMapping.ts`, `src/ColorLegend.tsx`, `src/controlPanel.tsx`,
  `src/transformProps.ts`, `src/types.ts`, `src/BimChart.tsx`
- tests: `test/colorMapping.test.ts`, `test/ColorLegend.test.tsx` (+ new)
