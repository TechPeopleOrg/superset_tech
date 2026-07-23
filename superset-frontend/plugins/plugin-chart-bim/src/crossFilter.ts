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
import { DataMask } from '@superset-ui/core';

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
