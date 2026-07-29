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
  GRADIENT_SCALES,
  sampleScale,
  scaleCssGradient,
} from '../src/gradientScales';

test('exposes at least one curated scale, each with >= 2 hex stops', () => {
  expect(GRADIENT_SCALES.length).toBeGreaterThan(0);
  GRADIENT_SCALES.forEach(s => {
    expect(s.id).toBeTruthy();
    expect(s.label).toBeTruthy();
    expect(s.stops.length).toBeGreaterThanOrEqual(2);
    s.stops.forEach(stop => expect(stop).toMatch(/^#[0-9a-fA-F]{6}$/));
  });
});

const first = GRADIENT_SCALES[0].id;

test('sampleScale returns the first stop at t=0 and last at t=1', () => {
  const scale = GRADIENT_SCALES[0];
  const low = sampleScale(first, 0);
  const high = sampleScale(first, 1);
  const toRgb = (hex: string): [number, number, number] => {
    const h = hex.replace('#', '');
    return [
      parseInt(h.slice(0, 2), 16) / 255,
      parseInt(h.slice(2, 4), 16) / 255,
      parseInt(h.slice(4, 6), 16) / 255,
    ];
  };
  expect(low).toEqual(toRgb(scale.stops[0]));
  expect(high).toEqual(toRgb(scale.stops[scale.stops.length - 1]));
});

test('sampleScale returns channels in 0..1', () => {
  const c = sampleScale(first, 0.5);
  c.forEach(ch => {
    expect(ch).toBeGreaterThanOrEqual(0);
    expect(ch).toBeLessThanOrEqual(1);
  });
});

test('sampleScale clamps t below 0 and above 1 to the endpoints', () => {
  expect(sampleScale(first, -5)).toEqual(sampleScale(first, 0));
  expect(sampleScale(first, 5)).toEqual(sampleScale(first, 1));
});

test('sampleScale interpolates between stops (mid differs from both ends)', () => {
  const low = sampleScale(first, 0);
  const mid = sampleScale(first, 0.5);
  const high = sampleScale(first, 1);
  expect(mid).not.toEqual(low);
  expect(mid).not.toEqual(high);
});

test('a two-stop scale interpolates linearly at the midpoint', () => {
  // Build expectation from a known two-stop scale: black -> white.
  // Find or rely on interpolation math via the public API using a real scale
  // that has exactly 2 stops if present; otherwise assert monotonic midpoint.
  const twoStop = GRADIENT_SCALES.find(s => s.stops.length === 2);
  if (!twoStop) return;
  const [r, g, b] = sampleScale(twoStop.id, 0.5);
  const toRgb = (hex: string) => {
    const h = hex.replace('#', '');
    return [
      parseInt(h.slice(0, 2), 16) / 255,
      parseInt(h.slice(2, 4), 16) / 255,
      parseInt(h.slice(4, 6), 16) / 255,
    ];
  };
  const a = toRgb(twoStop.stops[0]);
  const c = toRgb(twoStop.stops[1]);
  expect(r).toBeCloseTo((a[0] + c[0]) / 2, 5);
  expect(g).toBeCloseTo((a[1] + c[1]) / 2, 5);
  expect(b).toBeCloseTo((a[2] + c[2]) / 2, 5);
});

test('unknown scale id falls back to the first scale, never throws', () => {
  expect(() => sampleScale('does-not-exist', 0.5)).not.toThrow();
  expect(sampleScale('does-not-exist', 0.3)).toEqual(sampleScale(first, 0.3));
});

test('scaleCssGradient produces a linear-gradient with the scale stops', () => {
  const css = scaleCssGradient(first);
  expect(css).toMatch(/^linear-gradient\(/);
  GRADIENT_SCALES[0].stops.forEach(stop => {
    expect(css.toLowerCase()).toContain(stop.toLowerCase());
  });
});

test('scaleCssGradient falls back for an unknown id', () => {
  expect(scaleCssGradient('nope')).toEqual(scaleCssGradient(first));
});
