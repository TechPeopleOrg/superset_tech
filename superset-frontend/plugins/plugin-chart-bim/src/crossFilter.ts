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
import { DataMask, DataRecord } from '@superset-ui/core';

// A cross-filter clause from another chart, as it appears in
// formData.extra_form_data.filters: a column plus the selected value(s).
export interface AppliedFilter {
  col: string;
  val: unknown;
}

// Build a Superset cross-filter DataMask for a single selected element, or a
// cleared mask when globalId is null. The filter column is the same GlobalId
// column the chart links/colors by.
export function buildCrossFilterDataMask(
  linkColumn: string,
  globalId: string | null,
): DataMask {
  if (globalId === null) {
    return {
      extraFormData: { filters: [] },
      filterState: { value: null, selectedValues: null },
    };
  }
  return {
    extraFormData: {
      filters: [{ col: linkColumn, op: 'IN', val: [globalId] }],
    },
    filterState: { value: [globalId], selectedValues: [globalId] },
  };
}

// Read the incoming filterState (our own emitted value, round-tripped by
// Superset, or an external filter on the same column) into a flat array of
// GlobalId strings for highlighting. Tolerates flat arrays and arrays of
// single-element tuples; null/empty yields [].
export function selectedGlobalIdsFromFilterState(
  filterState: { value?: unknown } | undefined,
): string[] {
  const value = filterState?.value;
  if (!Array.isArray(value)) return [];
  return value
    .map(v => (Array.isArray(v) ? v[0] : v))
    .filter((v): v is string | number => v !== null && v !== undefined)
    .map(String);
}

// Resolve incoming cross-filters from other charts (on any column, e.g. a pie
// chart's `status` dimension) to the GlobalIds they select, by looking up the
// chart's own rows: every row whose filtered column matches contributes its
// linkColumn (GlobalId) value. Rows carry both the GlobalId (linkColumn) and
// the dimensions other charts filter by, so this maps "status = Late" back to
// the set of elements to highlight. Filters on linkColumn itself also work
// (they match rows by GlobalId directly). Returns a de-duplicated list; no
// filters, no linkColumn, or no matches yields [].
export function globalIdsFromAppliedFilters(
  filters: AppliedFilter[],
  rows: DataRecord[],
  linkColumn: string | undefined,
): string[] {
  if (!linkColumn || filters.length === 0) return [];
  // Normalize each filter's selected values into a Set of strings for lookup.
  const filterSets = filters.map(f => ({
    col: f.col,
    values: new Set(
      (Array.isArray(f.val) ? f.val : [f.val])
        .filter(v => v !== null && v !== undefined)
        .map(String),
    ),
  }));
  const ids = new Set<string>();
  rows.forEach(row => {
    // A row matches when it satisfies every applied filter (AND across filters).
    const matches = filterSets.every(({ col, values }) => {
      if (values.size === 0) return true;
      const cell = row[col];
      return cell !== null && cell !== undefined && values.has(String(cell));
    });
    if (!matches) return;
    const gid = row[linkColumn];
    if (gid !== null && gid !== undefined && String(gid).length > 0) {
      ids.add(String(gid));
    }
  });
  return Array.from(ids);
}
