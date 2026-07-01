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
  const result = transformProps(baseChartProps({ queriesData: [{ data: [] }] }));
  expect(result.modelUrl).toBe('');
});

test('transformProps returns empty modelUrl when cell is null', () => {
  const result = transformProps(
    baseChartProps({ queriesData: [{ data: [{ model_uuid: null }] }] }),
  );
  expect(result.modelUrl).toBe('');
});
