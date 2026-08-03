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
import buildColorMapping, {
  hexToRgb01,
  idsOutsideRange,
  type ColorMappingInput,
} from '../src/colorMapping';
import type { DataRecord } from '@superset-ui/core';

const colorFn = (v: string) =>
  ({ Done: '#00ff00', Late: '#ff0000' })[v] ?? '#0000ff';

test('hexToRgb01 converts hex to 0..1 rgb', () => {
  expect(hexToRgb01('#ff0000')).toEqual([1, 0, 0]);
  expect(hexToRgb01('#000000')).toEqual([0, 0, 0]);
});

test('hexToRgb01 falls back to grey for non-hex input (no NaN/green)', () => {
  // rgba() theme tokens and CSS names would otherwise yield NaN channels that
  // xeokit renders as solid green — must return a safe neutral grey instead.
  expect(hexToRgb01('rgba(255, 255, 255, 0.06)')).toEqual([0.8, 0.8, 0.8]);
  expect(hexToRgb01('red')).toEqual([0.8, 0.8, 0.8]);
  expect(hexToRgb01('')).toEqual([0.8, 0.8, 0.8]);
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

test('ignores override with a non-hex color and falls back to the palette', () => {
  const { colorById, legend } = buildColorMapping({
    rows: [{ gid: 'a', status: 'Done' }],
    linkColumn: 'gid',
    colorBy: 'status',
    colorFn,
    // "red" is a CSS name, not a #rrggbb hex — must not produce NaN colors.
    overrides: [{ value: 'Done', color: 'red' }],
  });
  // Falls back to colorFn('Done') = #00ff00 instead of [NaN, ..., NaN].
  expect(colorById.get('a')).toEqual([0, 1, 0]);
  expect(legend).toEqual([{ value: 'Done', color: '#00ff00' }]);
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

// --- gradient mode ---

const gradientInput = (
  rows: DataRecord[],
  extra: Partial<ColorMappingInput> = {},
): ColorMappingInput => ({
  rows,
  linkColumn: 'gid',
  colorBy: 'pct',
  colorFn,
  mode: 'gradient',
  gradientScaleId: 'grey-green',
  ...extra,
});

test('gradient: derives auto min/max from data and reports them in the legend', () => {
  const { gradientLegend } = buildColorMapping(
    gradientInput([
      { gid: 'a', pct: 20 },
      { gid: 'b', pct: 80 },
      { gid: 'c', pct: 50 },
    ]),
  );
  expect(gradientLegend).toEqual({
    scaleId: 'grey-green',
    min: 20,
    max: 80,
  });
});

test('gradient: min value maps to the scale start, max to the scale end', () => {
  const { colorById } = buildColorMapping(
    gradientInput([
      { gid: 'a', pct: 20 },
      { gid: 'b', pct: 80 },
    ]),
  );
  // grey-green starts at #c7ced6, ends at #137a3a.
  expect(colorById.get('a')).toEqual(hexToRgb01('#c7ced6'));
  expect(colorById.get('b')).toEqual(hexToRgb01('#137a3a'));
});

test('gradient: a mid value lands strictly between the endpoints', () => {
  const { colorById } = buildColorMapping(
    gradientInput([
      { gid: 'a', pct: 0 },
      { gid: 'b', pct: 100 },
      { gid: 'c', pct: 50 },
    ]),
  );
  const mid = colorById.get('c')!;
  expect(mid).not.toEqual(colorById.get('a'));
  expect(mid).not.toEqual(colorById.get('b'));
});

test('gradient: manual min/max override the data-derived bounds', () => {
  const { colorById, gradientLegend } = buildColorMapping(
    gradientInput(
      [
        { gid: 'a', pct: 20 },
        { gid: 'b', pct: 80 },
      ],
      { gradientMin: 0, gradientMax: 100 },
    ),
  );
  expect(gradientLegend).toEqual({ scaleId: 'grey-green', min: 0, max: 100 });
  // With bounds 0..100, neither 20 nor 80 sits at an endpoint.
  expect(colorById.get('a')).not.toEqual(hexToRgb01('#c7ced6'));
  expect(colorById.get('b')).not.toEqual(hexToRgb01('#137a3a'));
});

test('gradient: non-numeric / null / empty values are skipped (no color)', () => {
  const { colorById, stats } = buildColorMapping(
    gradientInput([
      { gid: 'a', pct: 10 },
      { gid: 'b', pct: 'n/a' },
      { gid: 'c', pct: null },
      { gid: 'd', pct: '' },
      { gid: 'e', pct: 90 },
    ]),
  );
  expect(colorById.has('a')).toBe(true);
  expect(colorById.has('e')).toBe(true);
  expect(colorById.has('b')).toBe(false);
  expect(colorById.has('c')).toBe(false);
  expect(colorById.has('d')).toBe(false);
  expect(stats.dataKeys).toBe(2);
});

test('gradient: a degenerate range (all equal) uses the scale midpoint, no NaN', () => {
  const { colorById } = buildColorMapping(
    gradientInput([
      { gid: 'a', pct: 42 },
      { gid: 'b', pct: 42 },
    ]),
  );
  const c = colorById.get('a')!;
  c.forEach(ch => expect(Number.isNaN(ch)).toBe(false));
  // Both equal values get the same (midpoint) color.
  expect(colorById.get('a')).toEqual(colorById.get('b'));
});

test('gradient: no gradientLegend leaks into categorical mode', () => {
  const r = buildColorMapping({
    rows: [{ gid: 'a', status: 'Done' }],
    linkColumn: 'gid',
    colorBy: 'status',
    colorFn,
  });
  expect(r.gradientLegend).toBeUndefined();
  expect(r.legend).toEqual([{ value: 'Done', color: '#00ff00' }]);
});

test('indexes every GlobalId by its category value', () => {
  const { idsByValue } = buildColorMapping({
    rows: [
      { gid: 'a', status: 'Done' },
      { gid: 'b', status: 'Late' },
      { gid: 'c', status: 'Done' },
    ],
    linkColumn: 'gid',
    colorBy: 'status',
    colorFn: () => '#00ff00',
  });
  expect(idsByValue.get('Done')).toEqual(['a', 'c']);
  expect(idsByValue.get('Late')).toEqual(['b']);
});

test('gradient mode yields no category index', () => {
  const { idsByValue } = buildColorMapping({
    rows: [{ gid: 'a', pct: 50 }],
    linkColumn: 'gid',
    colorBy: 'pct',
    colorFn: () => '#000000',
    mode: 'gradient',
    gradientScaleId: 'viridis',
  });
  expect(idsByValue.size).toBe(0);
});

test('gradient mode indexes each GlobalId by its numeric value', () => {
  const { numericById } = buildColorMapping({
    rows: [
      { gid: 'a', pct: 10 },
      { gid: 'b', pct: 90 },
    ],
    linkColumn: 'gid',
    colorBy: 'pct',
    colorFn: () => '#000000',
    mode: 'gradient',
    gradientScaleId: 'viridis',
  });
  expect(numericById.get('a')).toBe(10);
  expect(numericById.get('b')).toBe(90);
});

test('categorical mode yields no numeric index', () => {
  const { numericById } = buildColorMapping({
    rows: [{ gid: 'a', status: 'Done' }],
    linkColumn: 'gid',
    colorBy: 'status',
    colorFn: () => '#00ff00',
  });
  expect(numericById.size).toBe(0);
});

test('no range selected leaves everything lit', () => {
  const values = new Map([['a', 10]]);
  expect(idsOutsideRange(values, null)).toEqual([]);
});

test('reports only the ids outside the selected range', () => {
  const values = new Map([
    ['a', 10],
    ['b', 50],
    ['c', 90],
  ]);
  expect(idsOutsideRange(values, [40, 70])).toEqual(['a', 'c']);
});

test('the range bounds are inclusive', () => {
  const values = new Map([
    ['a', 40],
    ['b', 70],
  ]);
  expect(idsOutsideRange(values, [40, 70])).toEqual([]);
});

test('an empty index yields nothing to dim', () => {
  expect(idsOutsideRange(new Map(), [0, 1])).toEqual([]);
});
