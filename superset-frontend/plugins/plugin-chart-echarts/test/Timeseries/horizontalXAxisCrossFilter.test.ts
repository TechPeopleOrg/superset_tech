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
import { pickXAxisCrossFilterValue } from '../../src/Timeseries/EchartsTimeseries';

test('takes the category from index 0 on vertical charts', () => {
  expect(pickXAxisCrossFilterValue(['Монтаж', 3281], false)).toBe('Монтаж');
});

test('takes the category from index 1 on horizontal charts', () => {
  expect(pickXAxisCrossFilterValue([3281, 'Монтаж'], true)).toBe('Монтаж');
});

test('never emits the metric value as the filter on horizontal charts', () => {
  expect(pickXAxisCrossFilterValue([3281, 'Монтаж'], true)).not.toBe(3281);
});

test('returns null when the point has no value at that index', () => {
  expect(pickXAxisCrossFilterValue([3281], true)).toBeNull();
  expect(pickXAxisCrossFilterValue([], false)).toBeNull();
});

test('treats a null category as nothing to filter by', () => {
  expect(pickXAxisCrossFilterValue([null, 5], false)).toBeNull();
  expect(pickXAxisCrossFilterValue([5, null], true)).toBeNull();
});

test('keeps numeric categories, which are legitimate values', () => {
  expect(pickXAxisCrossFilterValue([2024, 100], false)).toBe(2024);
  expect(pickXAxisCrossFilterValue([100, 2024], true)).toBe(2024);
});

test('handles a missing data array', () => {
  expect(pickXAxisCrossFilterValue(undefined, false)).toBeNull();
});

test('reads points wrapped by color-by-axis, vertical', () => {
  expect(pickXAxisCrossFilterValue({ value: ['Монтаж', 3281] }, false)).toBe(
    'Монтаж',
  );
});

test('reads points wrapped by color-by-axis, horizontal', () => {
  expect(pickXAxisCrossFilterValue({ value: [3281, 'Монтаж'] }, true)).toBe(
    'Монтаж',
  );
});

test('handles a wrapped point with no value array', () => {
  expect(pickXAxisCrossFilterValue({}, false)).toBeNull();
});
