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
import { buildQueryContext, QueryFormData } from '@superset-ui/core';

export default function buildQuery(formData: QueryFormData) {
  const linkColumn = (formData.link_column ?? formData.linkColumn) as
    | string
    | undefined;
  const colorBy = (formData.color_by ?? formData.colorBy) as string | undefined;

  // Native dashboard filters flow into the query normally (they filter the
  // viewer's data/coloring, like every other chart). Cross-filters from other
  // charts are kept out of the query at the dashboard layer (for charts with
  // the SuppressRefetchSpinner behavior) so they only drive highlighting, not
  // re-coloring — see getFormDataWithExtraFilters. Nothing to strip here.
  const crossFilters =
    (
      formData.cross_filters_data ??
      (formData as { crossFiltersData?: { filters?: { col?: string }[] } })
        .crossFiltersData
    )?.filters ?? [];
  const crossFilterColumns: string[] = [];
  crossFilters.forEach((filter: { col?: string } | null) => {
    const col = filter?.col;
    if (col && col !== linkColumn && col !== colorBy) {
      if (!crossFilterColumns.includes(col)) crossFilterColumns.push(col);
    }
  });

  return buildQueryContext(formData, baseQueryObject => [
    {
      ...baseQueryObject,
      columns:
        linkColumn && colorBy
          ? [linkColumn, colorBy, ...crossFilterColumns]
          : baseQueryObject.columns,
    },
  ]);
}
