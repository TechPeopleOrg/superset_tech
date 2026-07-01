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
    // Dataset column holding the model UUID; the value of the first row is used.
    model_column?: string;
    // Scene background color (CSS color string).
    background_color?: string;
    // Whether to render element edges.
    show_edges?: boolean;
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
};
