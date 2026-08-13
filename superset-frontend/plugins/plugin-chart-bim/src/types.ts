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
import { QueryFormData, DataRecord, DataMask } from '@superset-ui/core';
import type { Vec3 } from './navCubeMath';

export interface BimStylesProps {
  height: number;
  width: number;
}

// Control-panel form fields for the BIM chart (MVP: display only).
export type BimFormData = QueryFormData &
  BimStylesProps & {
    // Control names as declared in the control panel (snake_case). Superset
    // camelCases them into formData, so the camelCase variants below are what
    // transformProps actually reads; both are kept for safety.
    model_column?: string;
    show_edges?: boolean;
    // TEMPORARY (manual testing without a dataset): a directly-entered model
    // UUID that overrides `model_column`. Remove once dataset-driven use is the
    // norm.
    model_uuid?: string;
    // camelCased variants Superset puts into formData.
    modelColumn?: string;
    modelUuid?: string;
    showEdges?: boolean;
    // --- Data-binding controls (link elements to dataset rows and color them) ---
    link_column?: string;
    color_by?: string;
    color_overrides?: string; // JSON string of { value, color }[]
    color_mode?: 'categorical' | 'gradient';
    gradient_scale?: string;
    gradient_min?: string | number;
    gradient_max?: string | number;
    linkColumn?: string;
    colorBy?: string;
    colorOverrides?: string;
    colorMode?: 'categorical' | 'gradient';
    gradientScale?: string;
    gradientMin?: string | number;
    gradientMax?: string | number;
    context_mode?: 'faded' | 'opaque' | 'hidden';
    context_opacity?: number;
    no_data_color?: string;
    highlight_color?: string;
    show_tree?: boolean;
    show_legend?: boolean;
    show_matched?: boolean;
    show_properties?: boolean;
    contextMode?: 'faded' | 'opaque' | 'hidden';
    contextOpacity?: number;
    noDataColor?: string;
    highlightColor?: string;
    showTree?: boolean;
    showLegend?: boolean;
    showMatched?: boolean;
    showProperties?: boolean;
  };

export type BimChartProps = BimStylesProps & {
  formData: BimFormData;
  // Resolved model URL (empty string when no UUID is available).
  modelUrl: string;
  showEdges?: boolean;
  navMode?: 'orbit' | 'firstPerson' | 'planView';
  // --- Data-binding props (link elements to dataset rows and color them) ---
  // Query result rows, passed through unchanged for row-level lookups.
  rows: DataRecord[];
  // Dashboard/chart color scheme id (e.g. from the `color_scheme` control).
  // Not consumed directly for painting (colorFn already resolves colors
  // against it) — it exists so the color-mapping cache key can detect a
  // scheme change even though colorFn's own reference is excluded from that
  // key's dependencies.
  colorScheme?: string;
  // Column whose values match xeokit object/metaObject ids.
  linkColumn?: string;
  // Column whose values are mapped to colors.
  colorBy?: string;
  // Resolves a data value to a hex color, backed by Superset's shared
  // categorical palette (CategoricalColorNamespace) — no hardcoded colors.
  colorFn: (value: string) => string;
  // Explicit value -> color overrides, parsed from the color_overrides
  // control; takes priority over colorFn for matching values.
  overrides: { value: string; color: string }[];
  // 'categorical' (palette per value) or 'gradient' (numeric on a scale). Default categorical.
  colorMode?: 'categorical' | 'gradient';
  // Gradient scale id (from gradientScales) used in gradient mode.
  gradientScaleId?: string;
  // Manual gradient bounds; undefined means auto-derive from the data.
  gradientMin?: number;
  gradientMax?: number;
  // When true, clicking an element emits a Superset cross-filter.
  emitCrossFilters?: boolean;
  // Emits a cross-filter DataMask to the dashboard. A no-op when unavailable.
  setDataMask: (dataMask: DataMask) => void;
  // Incoming filter on the link column (our own click, round-tripped, or an
  // external filter). Used to highlight matching elements in the scene.
  filterState?: { value?: unknown };
  // Cross-filters from other charts (on any column, e.g. a pie's status
  // dimension), read from extra_form_data. Resolved to GlobalIds via rows to
  // highlight the matching elements.
  appliedFilters?: { col: string; val: unknown }[];
  // How to render elements with no matching data row.
  contextMode: 'faded' | 'opaque' | 'hidden';
  // Opacity (0..1) for faded no-data elements.
  contextOpacity: number;
  // Hex color for no-data elements.
  noDataColor: string;
  // Hex color for cross-filter highlighting.
  highlightColor: string;
  // Overlay visibility toggles.
  showTree: boolean;
  showLegend: boolean;
  showMatched: boolean;
  showProperties: boolean;
};

// A node in the model's IFC containment hierarchy, built from xeokit metadata.
// `id` is the metaObject id, which equals the entity/objectId used to toggle
// visibility in the scene.
export interface TreeNode {
  id: string;
  name: string;
  type: string;
  children: TreeNode[];
}

// What the model knows about an element, read from xeokit's metaScene. The
// .xkt format carries no IFC property sets, so this is all of it.
export interface ObjectInfo {
  id: string;
  name: string;
  type: string;
  // Ancestor display names, root-first, excluding the object itself.
  path: string[];
  // The same ancestors as ids, nearest-first — the order row lookup climbs in.
  ancestorIds: string[];
}

// Imperative visibility controls over the live viewer. All xeokit access lives
// behind this interface so the tree UI stays engine-agnostic.
export interface XeokitApi {
  // Show or hide the given objects.
  setVisible(objectIds: string[], visible: boolean): void;
  // Show only the given objects; hide everything else.
  isolate(objectIds: string[]): void;
  // Make every object visible again.
  showAll(): void;
  // Current visibility of every object, keyed by objectId.
  getVisibility(): Record<string, boolean>;
  // Set the RGB colorize multiplier (0..1) on the given objects. Non-existent
  // ids are silently ignored.
  colorize(objectIds: string[], rgb: [number, number, number]): void;
  // Set the opacity factor (0..1) on the given objects, e.g. to fade
  // "no data" context elements. Non-existent ids are silently ignored.
  setOpacity(objectIds: string[], opacity: number): void;
  // Reset colorize to neutral [1,1,1] for the given objects, or all objects
  // when omitted.
  resetColors(objectIds?: string[]): void;
  // Expand a metaObject id to the geometry object ids beneath it (or the id
  // itself when it is a geometry leaf). Non-geometry ids are filtered out.
  expandToLeaves(id: string): string[];
  // Every geometry object id in the scene.
  allObjectIds(): string[];
  // Subscribe to element clicks. The callback receives the picked element's
  // bare GlobalId (metaObject id), or null when the click hits empty space.
  // Returns an unsubscribe function that removes the listener.
  onPick(cb: (globalId: string | null) => void): () => void;
  // Highlight exactly the given objects (expanded to their geometry leaves),
  // clearing any previous highlight first. An empty array clears all.
  highlight(objectIds: string[]): void;
  // Set the cross-filter highlight colour (#rrggbb hex).
  setHighlightColor(hex: string): void;
  // Model-side metadata for an element (name, IFC type, containment path).
  // Undefined when the id is not in the model's metadata.
  getObjectInfo(id: string): ObjectInfo | undefined;
  // Frame the whole model in the viewport (fit to the current scene bounds).
  fit(): void;
  // Subscribe to camera movement. The callback receives the camera's eye, look
  // and up vectors, and fires on every change (including each frame of a drag).
  // Returns an unsubscribe function that removes the listener.
  onCameraChange(cb: (eye: Vec3, look: Vec3, up: Vec3) => void): () => void;
  // Fly the camera to view the model from `dir` (a unit vector pointing from
  // the model's centre toward the eye), with `up` as the camera's up vector.
  // Frames the whole model, like fit().
  flyToDir(dir: Vec3, up: Vec3): void;
}
