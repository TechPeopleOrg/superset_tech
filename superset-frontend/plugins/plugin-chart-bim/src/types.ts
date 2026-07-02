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
    // --- Reserved for the data-binding stage (NOT implemented in this MVP) ---
    // link_column?: string;       // dataset column with element GlobalId
    // category_column?: string;   // column whose value drives element color
    // color_map?: { value: string; color: string }[];
    // cross_filter_mode?: 'data_mask' | 'native_filters';
  };

export type BimChartProps = BimStylesProps & {
  formData: BimFormData;
  // Resolved model URL (empty string when no UUID is available).
  modelUrl: string;
  backgroundColor?: string;
  showEdges?: boolean;
  navMode?: 'orbit' | 'firstPerson' | 'planView';
};
