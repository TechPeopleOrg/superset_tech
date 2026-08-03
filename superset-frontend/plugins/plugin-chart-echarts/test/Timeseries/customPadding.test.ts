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
import { EchartsTimeseriesChartProps } from '../../src/types';
import transformProps from '../../src/Timeseries/transformProps';
import { DEFAULT_FORM_DATA } from '../../src/Timeseries/constants';
import { createEchartsTimeseriesTestChartProps } from '../helpers';
import { applyCustomPadding } from '../../src/Timeseries/transformers';

const gridFor = (formData: Record<string, unknown>) => {
  const props = createEchartsTimeseriesTestChartProps<
    never,
    EchartsTimeseriesChartProps
  >({
    defaultFormData: DEFAULT_FORM_DATA as never,
    defaultVizType: 'echarts_timeseries_bar',
    formData: formData as never,
    defaultQueriesData: [
      { data: [{ __timestamp: 599616000000, Berlin: 1 }] } as never,
    ],
    height: 600,
  });
  const { echartOptions } = transformProps(props);
  return (echartOptions as { grid: Record<string, number> }).grid;
};

const auto = { top: 10, right: 20, bottom: 30, left: 40 };

test('returns the computed padding when the option is off', () => {
  expect(applyCustomPadding(auto, false, { bottom: 5 })).toEqual(auto);
});

test('returns the computed padding when nothing is customized', () => {
  expect(applyCustomPadding(auto, true, {})).toEqual(auto);
});

test('overrides only the sides that are set', () => {
  expect(applyCustomPadding(auto, true, { bottom: 5 })).toEqual({
    ...auto,
    bottom: 5,
  });
});

test('overrides every side when all are set', () => {
  expect(
    applyCustomPadding(auto, true, {
      top: 1,
      right: 2,
      bottom: 3,
      left: 4,
    }),
  ).toEqual({ top: 1, right: 2, bottom: 3, left: 4 });
});

test('accepts numeric strings from text controls', () => {
  expect(applyCustomPadding(auto, true, { bottom: '15' })).toEqual({
    ...auto,
    bottom: 15,
  });
});

test('a blank side keeps its automatic value', () => {
  expect(
    applyCustomPadding(auto, true, { bottom: '', top: null, right: undefined }),
  ).toEqual(auto);
});

test('a non-numeric side keeps its automatic value', () => {
  expect(applyCustomPadding(auto, true, { bottom: 'abc' })).toEqual(auto);
});

test('zero is a real value, not a blank', () => {
  expect(applyCustomPadding(auto, true, { bottom: 0 })).toEqual({
    ...auto,
    bottom: 0,
  });
});

test('does not mutate the padding it is given', () => {
  const original = { ...auto };
  applyCustomPadding(auto, true, { bottom: 99 });
  expect(auto).toEqual(original);
});

test('a custom bottom reaches the rendered grid', () => {
  const grid = gridFor({ customPadding: true, paddingBottom: 7 });
  expect(grid.bottom).toBe(7);
});

test('the grid keeps automatic padding when the option is off', () => {
  const auto = gridFor({});
  const ignored = gridFor({ customPadding: false, paddingBottom: 7 });
  expect(ignored.bottom).toBe(auto.bottom);
});

test('sides left blank keep their automatic value in the grid', () => {
  const auto = gridFor({});
  const grid = gridFor({ customPadding: true, paddingBottom: 7 });
  expect(grid.top).toBe(auto.top);
  expect(grid.left).toBe(auto.left);
  expect(grid.right).toBe(auto.right);
});
