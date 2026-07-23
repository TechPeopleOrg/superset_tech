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
  buildCrossFilterDataMask,
  selectedGlobalIdsFromFilterState,
} from '../src/crossFilter';

test('buildCrossFilterDataMask builds an IN filter for a selection', () => {
  const mask = buildCrossFilterDataMask('GlobalId', 'gid-1');
  expect(mask.extraFormData).toEqual({
    filters: [{ col: 'GlobalId', op: 'IN', val: ['gid-1'] }],
  });
  expect(mask.filterState).toEqual({
    value: ['gid-1'],
    selectedValues: ['gid-1'],
  });
});

test('buildCrossFilterDataMask clears the filter when globalId is null', () => {
  const mask = buildCrossFilterDataMask('GlobalId', null);
  expect(mask.extraFormData).toEqual({ filters: [] });
  expect(mask.filterState).toEqual({ value: null, selectedValues: null });
});

test('selectedGlobalIdsFromFilterState reads value into a flat string array', () => {
  expect(selectedGlobalIdsFromFilterState({ value: ['a', 'b'] })).toEqual([
    'a',
    'b',
  ]);
});

test('selectedGlobalIdsFromFilterState handles nested arrays (echarts shape)', () => {
  // Superset may round-trip filterState.value as an array of tuples.
  expect(selectedGlobalIdsFromFilterState({ value: [['a'], ['b']] })).toEqual([
    'a',
    'b',
  ]);
});

test('selectedGlobalIdsFromFilterState returns [] for null/empty/undefined', () => {
  expect(selectedGlobalIdsFromFilterState(undefined)).toEqual([]);
  expect(selectedGlobalIdsFromFilterState({ value: null })).toEqual([]);
  expect(selectedGlobalIdsFromFilterState({ value: [] })).toEqual([]);
});
