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
import buildQuery from '../src/buildQuery';

const base = {
  datasource: '1__table',
  viz_type: 'bim',
} as any;

test('adds link_column and color_by to groupby when both set', () => {
  const q = buildQuery({ ...base, link_column: 'gid', color_by: 'status' });
  expect(q.queries[0].columns).toEqual(['gid', 'status']);
});

test('no groupby when link_column or color_by missing', () => {
  const q = buildQuery({ ...base, link_column: 'gid' });
  expect(q.queries[0].columns ?? []).toEqual([]);
});

test('lets dashboard filters flow into the query (they filter the data)', () => {
  // Native dashboard filters land in extra_form_data.filters and must reach the
  // query so they filter the viewer's data/coloring like any other chart.
  // Cross-filters are excluded upstream (dashboard layer) for this chart type,
  // not here, so buildQuery itself passes extra_form_data through unchanged.
  const q = buildQuery({
    ...base,
    link_column: 'gid',
    color_by: 'status',
    extra_form_data: {
      filters: [{ col: 'floor', op: 'IN', val: ['3'] }],
    },
  } as any);
  expect(q.queries[0].filters).toEqual([
    { col: 'floor', op: 'IN', val: ['3'] },
  ]);
});
