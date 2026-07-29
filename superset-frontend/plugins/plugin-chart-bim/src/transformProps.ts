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
import {
  ChartProps,
  DataRecord,
  CategoricalColorNamespace,
} from '@superset-ui/core';
import { BimChartProps, BimFormData } from './types';

// Build the model download URL from a storage UUID. Kept as a named export so
// tests can assert the exact URL shape without going through transformProps.
export function buildModelUrl(uuid: string): string {
  return `/fileuploader/api/files/${uuid}/content`;
}

export default function transformProps(chartProps: ChartProps): BimChartProps {
  const { width, height, formData, queriesData } = chartProps;
  const fd = formData as BimFormData;

  const data = (queriesData?.[0]?.data ?? []) as DataRecord[];
  // Superset camelCases control names into formData (e.g. `model_column` →
  // `modelColumn`), but some paths preserve snake_case — read both to be safe.
  const modelColumn = fd.modelColumn ?? fd.model_column;

  const linkColumn = fd.linkColumn ?? fd.link_column;
  const colorBy = fd.colorBy ?? fd.color_by;

  // Same categorical palette every Superset chart uses; no hardcoded colors.
  // Pass sliceId so colors are keyed to this chart's label-color map (matches
  // how the built-in charts resolve categorical colors).
  const colorScheme = (fd.color_scheme ?? fd.colorScheme) as string | undefined;
  const sliceId = (fd.slice_id ?? fd.sliceId) as number | undefined;
  const scale = CategoricalColorNamespace.getScale(colorScheme as string);
  const colorFn = (value: string) => scale.getColor(value, sliceId) as string;

  let overrides: { value: string; color: string }[] = [];
  const rawOverrides = fd.colorOverrides ?? fd.color_overrides;
  if (rawOverrides) {
    try {
      const parsed = JSON.parse(rawOverrides);
      if (Array.isArray(parsed)) {
        // Explicit array form: [{"value":"Done","color":"#00ff00"}].
        overrides = parsed;
      } else if (parsed && typeof parsed === 'object') {
        // Object-map form: {"Done":"#00ff00"} — the natural way to write it.
        overrides = Object.entries(parsed).map(([value, color]) => ({
          value,
          color: String(color),
        }));
      }
    } catch {
      // Invalid JSON: fall back to the automatic palette only.
      overrides = [];
    }
  }

  // Coloring mode + gradient settings (all user-chosen, data-driven).
  const colorMode =
    (fd.colorMode ?? fd.color_mode) === 'gradient' ? 'gradient' : 'categorical';
  const gradientScaleId = (fd.gradientScale ?? fd.gradient_scale) as
    | string
    | undefined;
  // Empty/non-numeric → undefined (auto bounds).
  const parseBound = (raw: string | number | undefined): number | undefined => {
    if (raw === undefined || raw === null || raw === '') return undefined;
    const n = Number(raw);
    return Number.isFinite(n) ? n : undefined;
  };
  const gradientMin = parseBound(fd.gradientMin ?? fd.gradient_min);
  const gradientMax = parseBound(fd.gradientMax ?? fd.gradient_max);

  const { emitCrossFilters = false } = chartProps as {
    emitCrossFilters?: boolean;
  };
  const { filterState } = chartProps as {
    filterState?: { value?: unknown };
  };
  const setDataMask =
    (chartProps as { hooks?: { setDataMask?: (dm: unknown) => void } }).hooks
      ?.setDataMask ?? (() => {});

  // Cross-filters from other charts (e.g. a pie chart's status dimension) reach
  // this chart through `cross_filters_data` — the dashboard keeps them out of
  // extra_form_data (so they don't re-query/re-color the model, Power BI-style)
  // and hands them here separately for highlighting. Native dashboard filters
  // stay in extra_form_data and filter the data normally. Superset camelCases
  // the field into formData as `crossFiltersData`; read both spellings.
  const cfShape = fd as {
    crossFiltersData?: { filters?: { col: string; val: unknown }[] };
    cross_filters_data?: { filters?: { col: string; val: unknown }[] };
  };
  const crossFiltersData =
    cfShape.crossFiltersData ?? cfShape.cross_filters_data;
  const appliedFilters = (crossFiltersData?.filters ?? []).map(f => ({
    col: f.col,
    val: f.val,
  }));

  let modelUrl = '';
  // TEMPORARY (manual testing without a dataset): a directly-entered model UUID
  // takes priority over the dataset column, so different models can be tried by
  // pasting a UUID into the control. Remove `model_uuid` once dataset-driven use
  // is the norm.
  const manualUuid = (fd.modelUuid ?? fd.model_uuid)?.trim();
  if (manualUuid) {
    modelUrl = buildModelUrl(manualUuid);
  } else if (modelColumn && data.length > 0) {
    const raw = data[0][modelColumn];
    if (raw !== null && raw !== undefined && String(raw).length > 0) {
      modelUrl = buildModelUrl(String(raw));
    }
  }

  return {
    width,
    height,
    formData: fd,
    modelUrl,
    showEdges: fd.showEdges ?? fd.show_edges ?? false,
    // Initial navigation mode. Switchable at runtime from the viewer toolbar,
    // so there is no chart-level control for it; orbit is the sensible default
    // for inspecting a model from outside.
    navMode: 'orbit',
    rows: data,
    linkColumn,
    colorBy,
    colorFn,
    overrides,
    colorMode,
    gradientScaleId,
    gradientMin,
    gradientMax,
    colorScheme,
    emitCrossFilters,
    setDataMask: setDataMask as BimChartProps['setDataMask'],
    filterState,
    appliedFilters,
    contextMode: fd.contextMode ?? fd.context_mode ?? 'faded',
    // Slider gives 0..100; the viewer wants 0..1.
    contextOpacity: (fd.contextOpacity ?? fd.context_opacity ?? 25) / 100,
    noDataColor: fd.noDataColor ?? fd.no_data_color ?? '#cccccc',
    highlightColor: fd.highlightColor ?? fd.highlight_color ?? '#00d9ff',
    showTree: fd.showTree ?? fd.show_tree ?? true,
    showLegend: fd.showLegend ?? fd.show_legend ?? true,
    showMatched: fd.showMatched ?? fd.show_matched ?? true,
  };
}
