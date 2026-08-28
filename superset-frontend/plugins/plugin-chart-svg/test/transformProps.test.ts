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
import { ChartProps } from '@superset-ui/core';
import transformProps, { buildSvgUrl } from '../src/transformProps';

const baseChartProps = (overrides: Partial<ChartProps>) =>
  ({
    width: 800,
    height: 600,
    formData: {
      overview_column: 'complex_map',
      detail_column: 'floor_map',
    },
    queriesData: [
      { data: [{ complex_map: 'over-1', floor_map: 'det-1', house: 1 }] },
    ],
    ...overrides,
  }) as unknown as ChartProps;

test('buildSvgUrl builds the proxy content URL', () => {
  expect(buildSvgUrl('abc-123')).toBe(
    '/fileuploader/api/files/abc-123/content',
  );
});

test('transformProps reads both uuids from the first row', () => {
  const result = transformProps(baseChartProps({}));
  expect(result.overviewUuid).toBe('over-1');
  expect(result.detailUuid).toBe('det-1');
  expect(result.width).toBe(800);
  expect(result.height).toBe(600);
});

test('transformProps accepts camelCase control names', () => {
  const result = transformProps(
    baseChartProps({
      formData: {
        overviewColumn: 'complex_map',
        detailColumn: 'floor_map',
      } as unknown as ChartProps['formData'],
    }),
  );
  expect(result.overviewUuid).toBe('over-1');
  expect(result.detailUuid).toBe('det-1');
});

test('transformProps returns empty uuids when columns are unset', () => {
  const result = transformProps(
    baseChartProps({ formData: {} as ChartProps['formData'] }),
  );
  expect(result.overviewUuid).toBe('');
  expect(result.detailUuid).toBe('');
});

test('transformProps returns empty uuids when there are no rows', () => {
  const result = transformProps(
    baseChartProps({ queriesData: [{ data: [] }] }),
  );
  expect(result.overviewUuid).toBe('');
  expect(result.detailUuid).toBe('');
});

test('transformProps ignores null and empty cell values', () => {
  const result = transformProps(
    baseChartProps({
      queriesData: [{ data: [{ complex_map: null, floor_map: '' }] }],
    }),
  );
  expect(result.overviewUuid).toBe('');
  expect(result.detailUuid).toBe('');
});

test('transformProps still exposes rows and columns for the renderer', () => {
  const result = transformProps(baseChartProps({}));
  expect(result.data).toHaveLength(1);
  expect(result.svgOptions.tooltip.show).toBe(true);
});

test('manual uuids take priority over the dataset columns', () => {
  const result = transformProps(
    baseChartProps({
      formData: {
        overview_column: 'complex_map',
        detail_column: 'floor_map',
        overview_uuid: 'manual-over',
        detail_uuid: 'manual-det',
      } as unknown as ChartProps['formData'],
    }),
  );
  expect(result.overviewUuid).toBe('manual-over');
  expect(result.detailUuid).toBe('manual-det');
});

test('a manual uuid overrides only its own mode', () => {
  const result = transformProps(
    baseChartProps({
      formData: {
        overview_column: 'complex_map',
        detail_column: 'floor_map',
        overview_uuid: 'manual-over',
      } as unknown as ChartProps['formData'],
    }),
  );
  expect(result.overviewUuid).toBe('manual-over');
  expect(result.detailUuid).toBe('det-1');
});

test('whitespace-only manual uuids fall back to the columns', () => {
  const result = transformProps(
    baseChartProps({
      formData: {
        overview_column: 'complex_map',
        detail_column: 'floor_map',
        overview_uuid: '   ',
        detail_uuid: '',
      } as unknown as ChartProps['formData'],
    }),
  );
  expect(result.overviewUuid).toBe('over-1');
  expect(result.detailUuid).toBe('det-1');
});
