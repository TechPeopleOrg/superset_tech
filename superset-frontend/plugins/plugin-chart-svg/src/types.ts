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
// The literal colors below are default *data* values (CSS color strings the SVG
// renderer consumes), not theme styling.
/* eslint-disable theme-colors/no-literal-colors */
import { DataRecord, QueryFormData } from '@superset-ui/core';

export interface SvgStylesProps {
  height: number;
  width: number;
}

export interface SvgStatusColor {
  status: string;
  color: string;
}

// Shared default mapping so the control and transformProps stay in sync.
export const DEFAULT_STATUS_COLORS: SvgStatusColor[] = [
  { status: 'Бронь', color: '#20a8c9' },
  { status: 'Маркетинговая сделка', color: '#5ac28a' },
  { status: 'Маркетинговый резерв', color: '#e04355' },
  { status: 'Подбор', color: '#454e7d' },
  { status: 'Проверка', color: '#e0a448' },
  { status: 'Сделка в работе', color: '#ff8b48' },
];

// User-configurable SVGCore options surfaced through the control panel.
// Complex options (`type`, `data`, tooltip/label `formatter`, `events`) stay
// hardcoded in the chart component because they depend on runtime state.
export interface SvgConfigurableOptions {
  colorRange: string;
  colorStatus: SvgStatusColor[];
  tooltip: {
    show: boolean;
    position: 'top' | 'bottom';
    positionAuto: boolean;
    fontSize?: number;
    fontFamily?: string;
    background?: string;
    borderColor?: string;
    borderRadius?: number;
    color?: string;
    padding?: number;
  };
  label: {
    show: boolean;
    fontSize?: number;
    fontFamily?: string;
    color?: string;
  };
}

export type SvgFormData = QueryFormData &
  SvgStylesProps & {
    color_range?: string;
    color_status?: SvgStatusColor[];
    tooltip_show?: boolean;
    tooltip_position?: 'top' | 'bottom';
    tooltip_position_auto?: boolean;
    tooltip_font_size?: number;
    tooltip_font_family?: string;
    tooltip_background?: string;
    tooltip_border_color?: string;
    tooltip_border_radius?: number;
    tooltip_color?: string;
    tooltip_padding?: number;
    label_show?: boolean;
    label_font_size?: number;
    label_font_family?: string;
    label_color?: string;
  };

export type SvgChartProps = SvgStylesProps & {
  formData: SvgFormData;
  // Raw rows returned by the query.
  data: DataRecord[];
  // Column names returned by the query.
  columns: string[];
  // The SVG markup to render.
  svg: string;
  // Resolved option values from the control panel.
  svgOptions: SvgConfigurableOptions;
};
