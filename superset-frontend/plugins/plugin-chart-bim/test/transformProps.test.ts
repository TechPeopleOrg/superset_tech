/*
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
import transformProps, { buildModelUrl } from '../src/transformProps';

const baseChartProps = (overrides: Partial<ChartProps>) =>
  ({
    width: 800,
    height: 600,
    formData: { model_column: 'model_uuid' },
    queriesData: [{ data: [{ model_uuid: 'abc-123' }] }],
    ...overrides,
  }) as unknown as ChartProps;

test('buildModelUrl builds the proxy content URL', () => {
  expect(buildModelUrl('abc-123')).toBe(
    '/fileuploader/api/files/abc-123/content',
  );
});

test('transformProps derives modelUrl from the first row', () => {
  const result = transformProps(baseChartProps({}));
  expect(result.modelUrl).toBe('/fileuploader/api/files/abc-123/content');
  expect(result.width).toBe(800);
  expect(result.height).toBe(600);
});

test('transformProps returns empty modelUrl when no model_column', () => {
  const result = transformProps(
    baseChartProps({ formData: {} as ChartProps['formData'] }),
  );
  expect(result.modelUrl).toBe('');
});

test('transformProps returns empty modelUrl when no rows', () => {
  const result = transformProps(
    baseChartProps({ queriesData: [{ data: [] }] }),
  );
  expect(result.modelUrl).toBe('');
});

test('transformProps returns empty modelUrl when cell is null', () => {
  const result = transformProps(
    baseChartProps({ queriesData: [{ data: [{ model_uuid: null }] }] }),
  );
  expect(result.modelUrl).toBe('');
});

test('passes rows, link/color columns and a colorFn to props', () => {
  const props = transformProps({
    width: 100,
    height: 100,
    formData: {
      link_column: 'gid',
      color_by: 'status',
      color_overrides: '[{"value":"Done","color":"#00ff00"}]',
      color_scheme: 'supersetColors',
    },
    queriesData: [{ data: [{ gid: 'a', status: 'Done' }] }],
  } as any);
  expect(props.rows).toEqual([{ gid: 'a', status: 'Done' }]);
  expect(props.linkColumn).toBe('gid');
  expect(props.colorBy).toBe('status');
  expect(props.overrides).toEqual([{ value: 'Done', color: '#00ff00' }]);
  expect(typeof props.colorFn).toBe('function');
  // colorScheme is passed through so BimChart can key its color mapping by it.
  expect(props.colorScheme).toBe('supersetColors');
});

test('overrides default to [] on invalid or empty json', () => {
  const props = transformProps({
    width: 1,
    height: 1,
    formData: { color_overrides: 'not json' },
    queriesData: [{ data: [] }],
  } as any);
  expect(props.overrides).toEqual([]);
});

test('accepts the object-map form {value: color}', () => {
  const props = transformProps({
    width: 1,
    height: 1,
    formData: {
      color_overrides: '{"Отставание":"#ff0000","Готово":"#00ff00"}',
    },
    queriesData: [{ data: [] }],
  } as any);
  expect(props.overrides).toEqual([
    { value: 'Отставание', color: '#ff0000' },
    { value: 'Готово', color: '#00ff00' },
  ]);
});

test('passes cross-filter plumbing through to props', () => {
  const setDataMask = jest.fn();
  const props = transformProps({
    width: 1,
    height: 1,
    formData: { link_column: 'gid', emit_cross_filters: true },
    queriesData: [{ data: [] }],
    emitCrossFilters: true,
    filterState: { value: ['gid-1'] },
    hooks: { setDataMask },
  } as any);
  expect(props.emitCrossFilters).toBe(true);
  expect(props.setDataMask).toBe(setDataMask);
  expect(props.filterState).toEqual({ value: ['gid-1'] });
});

test('setDataMask defaults to a no-op when hooks omit it', () => {
  const props = transformProps({
    width: 1,
    height: 1,
    formData: {},
    queriesData: [{ data: [] }],
  } as any);
  expect(typeof props.setDataMask).toBe('function');
  expect(() => props.setDataMask({} as any)).not.toThrow();
});
