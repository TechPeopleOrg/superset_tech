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
import { ChartProps, DataRecord } from '@superset-ui/core';
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
    backgroundColor: fd.backgroundColor ?? fd.background_color ?? '#ffffff',
    showEdges: fd.showEdges ?? fd.show_edges ?? false,
    navMode: fd.navMode ?? fd.nav_mode ?? 'firstPerson',
  };
}
