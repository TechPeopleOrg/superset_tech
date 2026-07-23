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

  // Strip cross-filter/native filter clauses from extra_form_data so the
  // viewer's own query always covers the full dataset: coloring reflects every
  // element's state and does not flicker when another chart cross-filters.
  // Incoming filters still reach the chart via filterState and only drive
  // highlighting. `extra_form_data` also carries non-filter fields (e.g.
  // time_grain) that we keep untouched.
  const extra = {
    ...((formData.extra_form_data as Record<string, unknown>) ?? {}),
  };
  delete extra.filters;
  delete extra.adhoc_filters;
  const cleanedFormData: QueryFormData = {
    ...formData,
    extra_form_data: extra,
  };

  return buildQueryContext(cleanedFormData, baseQueryObject => [
    {
      ...baseQueryObject,
      columns:
        linkColumn && colorBy ? [linkColumn, colorBy] : baseQueryObject.columns,
    },
  ]);
}
