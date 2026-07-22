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
import buildColorMapping, { hexToRgb01 } from '../src/colorMapping';

const colorFn = (v: string) =>
  ({ Done: '#00ff00', Late: '#ff0000' }[v] ?? '#0000ff');

test('hexToRgb01 converts hex to 0..1 rgb', () => {
  expect(hexToRgb01('#ff0000')).toEqual([1, 0, 0]);
  expect(hexToRgb01('#000000')).toEqual([0, 0, 0]);
});

test('maps each link id to the rgb of its category value', () => {
  const { colorById } = buildColorMapping({
    rows: [
      { gid: 'a', status: 'Done' },
      { gid: 'b', status: 'Late' },
    ],
    linkColumn: 'gid',
    colorBy: 'status',
    colorFn,
  });
  expect(colorById.get('a')).toEqual([0, 1, 0]);
  expect(colorById.get('b')).toEqual([1, 0, 0]);
});

test('legend has one entry per unique value in first-seen order', () => {
  const { legend } = buildColorMapping({
    rows: [
      { gid: 'a', status: 'Late' },
      { gid: 'b', status: 'Done' },
      { gid: 'c', status: 'Late' },
    ],
    linkColumn: 'gid',
    colorBy: 'status',
    colorFn,
  });
  expect(legend).toEqual([
    { value: 'Late', color: '#ff0000' },
    { value: 'Done', color: '#00ff00' },
  ]);
});

test('overrides win over colorFn for the given value', () => {
  const { colorById, legend } = buildColorMapping({
    rows: [{ gid: 'a', status: 'Done' }],
    linkColumn: 'gid',
    colorBy: 'status',
    colorFn,
    overrides: [{ value: 'Done', color: '#0000ff' }],
  });
  expect(colorById.get('a')).toEqual([0, 0, 1]);
  expect(legend).toEqual([{ value: 'Done', color: '#0000ff' }]);
});

test('skips rows with null/empty color value', () => {
  const { colorById, stats } = buildColorMapping({
    rows: [
      { gid: 'a', status: null },
      { gid: 'b', status: '' },
      { gid: 'c', status: 'Done' },
    ],
    linkColumn: 'gid',
    colorBy: 'status',
    colorFn,
  });
  expect(colorById.has('a')).toBe(false);
  expect(colorById.has('b')).toBe(false);
  expect(colorById.get('c')).toEqual([0, 1, 0]);
  expect(stats.dataKeys).toBe(1);
});

test('empty rows or empty colorBy yields empty map and legend', () => {
  const r = buildColorMapping({
    rows: [],
    linkColumn: 'gid',
    colorBy: 'status',
    colorFn,
  });
  expect(r.colorById.size).toBe(0);
  expect(r.legend).toEqual([]);
  expect(r.stats.dataKeys).toBe(0);
});
