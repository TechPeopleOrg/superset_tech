# BIM Viewer — Backlog & Known Issues

Running list of follow-up work for the `plugin-chart-bim` viewer, captured
2026-07-23. Not a task plan yet — each item gets its own spec/plan when picked
up.

## Known issue: visibility vs coloring conflict

The model tree manages element **visibility** (`setVisible` / `isolate` /
`showAll`), while the data-coloring paint effect calls `showAll()` on every
recompute (added so the "hidden" context mode can reset visibility before
hiding no-data elements).

**Problem:** if the user manually hides a storey via a tree checkbox, then a
filter / cross-filter fires, the paint effect's `showAll()` **wipes that manual
isolation**. The context mode "hidden" (which also uses `setVisible`) and the
tree's isolate can also overwrite each other, since neither knows about the
other.

Mature viewers keep **visibility** (what is shown) and **appearance**
(colour/opacity — how it's shown) as independent layers that never fight.
Here they overlap.

**Fix direction:** separate the two concerns. The paint effect should only
touch colour/opacity, never visibility; visibility should be owned solely by
the tree + context-mode, with a single source of truth so they compose instead
of clobbering. Needs a small design pass before implementing.

Related timing note: `ModelTree.initialCheckedKeys` reads `api.getVisibility()`
without gating on `ready` — same class of "scene not populated yet" timing bug
seen in coloring; verify it reads the populated scene.

## Value ideas (vs Power BI / BIM platforms)

Power BI has no native 3D/model tree — that's a paid custom visual. Our edge is
the native BIM-model ↔ schedule (P6) link. Highest value / effort:

1. **Numeric gradient coloring** (most requested). Colour by a continuous field
   (% complete, cost, schedule variance) with a sequential/diverging scale and
   a gradient legend, instead of only discrete categories. Small-ish work, big
   payoff. (Also in the original data-driven-coloring "later iterations".)
2. **4D timeline (schedule)** — the killer feature given the P6 data: a time
   slider that shows what's built as of a date (from planned/actual dates),
   colouring or revealing elements over time. Neither Power BI nor plain
   dashboards do this; we already have both the model and the P6 schedule.
3. **Element properties panel** — click an element → side panel with its IFC
   properties (mark, material, storey, dimensions) plus the row's data values
   (status, cost, contractor). Turns the viewer from a picture into an
   inspection tool.
4. **Aggregates / KPI overlays** — "Done: 45% (347 of 771)", "Behind: 12 on
   floor 3", computed from the rows and shown over the model.
5. **Isolate / filter by arbitrary data slice** — show only "Behind", only
   floor 5, only a contractor — beyond the current tree checkboxes and the
   binary "hidden" context mode.
6. **Measurements / section planes** — ruler, cut plane to look inside. Existed
   in earlier scrapped "obвесы"; reintroduce properly.

## Minor / cosmetic

- Highlight badge `box-shadow` uses a literal `rgba(0,0,0,0.15)` — the only
  remaining hardcoded colour; move to a theme token (theme-colors rule).
- Tree shows the bare metaObject id as the node name when IFC `name` is empty
  (`mo.name || mo.id`); many real IFCs have empty names → long GUIDs in the
  tree. Consider falling back to type + short id, or hiding nameless nodes.
