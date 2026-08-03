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
import { CategoricalColorScale } from '@superset-ui/core';
import { applyColorByPrimaryAxis } from '../../src/Timeseries/transformers';
import { EchartsTimeseriesChartProps } from '../../src/types';
import transformProps from '../../src/Timeseries/transformProps';
import { DEFAULT_FORM_DATA } from '../../src/Timeseries/constants';
import { createEchartsTimeseriesTestChartProps } from '../helpers';

const colorScale = new CategoricalColorScale(['#111111', '#222222']);

const series = {
  data: [
    ['A', 10],
    ['B', 20],
  ],
} as never;

test('carries the bar border radius onto every point', () => {
  const data = applyColorByPrimaryAxis(series, colorScale, 1, 1, false, 8);
  expect(data).toHaveLength(2);
  data.forEach(point => {
    expect(point.itemStyle.borderRadius).toBe(8);
  });
});

test('omits the radius when it is zero', () => {
  const data = applyColorByPrimaryAxis(series, colorScale, 1, 1, false, 0);
  data.forEach(point => {
    expect(point.itemStyle.borderRadius).toBeUndefined();
  });
});

test('omits the radius when none is given', () => {
  const data = applyColorByPrimaryAxis(series, colorScale, 1, 1);
  data.forEach(point => {
    expect(point.itemStyle.borderRadius).toBeUndefined();
  });
});

test('still colors each point by its category', () => {
  const data = applyColorByPrimaryAxis(series, colorScale, 1, 1, false, 8);
  expect(data[0].itemStyle.color).not.toBe(data[1].itemStyle.color);
  expect(data[0].value).toEqual(['A', 10]);
});

test('colors by the category axis on horizontal charts', () => {
  const data = applyColorByPrimaryAxis(series, colorScale, 1, 1, true, 8);
  expect(data[0].itemStyle.color).not.toBe(data[1].itemStyle.color);
  expect(data[0].itemStyle.borderRadius).toBe(8);
});

test('rounded corners survive color-by-axis in the rendered chart', () => {
  const props = createEchartsTimeseriesTestChartProps<
    never,
    EchartsTimeseriesChartProps
  >({
    defaultFormData: DEFAULT_FORM_DATA as never,
    defaultVizType: 'echarts_timeseries_bar',
    formData: {
      colorByPrimaryAxis: true,
      barBorderRadius: 12,
      seriesType: 'bar',
    } as never,
    defaultQueriesData: [
      { data: [{ __timestamp: 599616000000, Berlin: 1 }] } as never,
    ],
  });
  const { echartOptions } = transformProps(props);
  const [series] = (echartOptions as { series: { data: unknown[] }[] }).series;
  const points = series.data as { itemStyle?: { borderRadius?: number } }[];
  expect(points.length).toBeGreaterThan(0);
  points.forEach(p => expect(p.itemStyle?.borderRadius).toBe(12));
});
