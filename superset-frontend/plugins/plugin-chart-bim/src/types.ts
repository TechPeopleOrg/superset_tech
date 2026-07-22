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
import { QueryFormData } from '@superset-ui/core';

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
    background_color?: string;
    show_edges?: boolean;
    nav_mode?: 'orbit' | 'firstPerson' | 'planView';
    // TEMPORARY (manual testing without a dataset): a directly-entered model
    // UUID that overrides `model_column`. Remove once dataset-driven use is the
    // norm.
    model_uuid?: string;
    // camelCased variants Superset puts into formData.
    modelColumn?: string;
    modelUuid?: string;
    backgroundColor?: string;
    showEdges?: boolean;
    navMode?: 'orbit' | 'firstPerson' | 'planView';
    // --- Data-binding controls (link elements to dataset rows and color them) ---
    link_column?: string;
    color_by?: string;
    color_overrides?: string; // JSON string of { value, color }[]
    linkColumn?: string;
    colorBy?: string;
    colorOverrides?: string;
  };

export type BimChartProps = BimStylesProps & {
  formData: BimFormData;
  // Resolved model URL (empty string when no UUID is available).
  modelUrl: string;
  backgroundColor?: string;
  showEdges?: boolean;
  navMode?: 'orbit' | 'firstPerson' | 'planView';
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
  // Reset colorize to neutral [1,1,1] for the given objects, or all objects
  // when omitted.
  resetColors(objectIds?: string[]): void;
  // Expand a metaObject id to the geometry object ids beneath it (or the id
  // itself when it is a geometry leaf). Non-geometry ids are filtered out.
  expandToLeaves(id: string): string[];
  // Every geometry object id in the scene.
  allObjectIds(): string[];
}
