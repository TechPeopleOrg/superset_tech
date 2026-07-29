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

// Sequential color scales for numeric (gradient) coloring. Generic low→high ramps, not model/data-specific.

export interface GradientScale {
  id: string;
  label: string;
  // #rrggbb stops, low→high, at least two.
  stops: string[];
}

// First scale is the default. Palette data (raw rgb for xeokit colorize), not theme tokens.
/* eslint-disable theme-colors/no-literal-colors */
export const GRADIENT_SCALES: GradientScale[] = [
  {
    id: 'grey-green',
    label: 'Grey → Green',
    stops: ['#c7ced6', '#89b98d', '#3f9e64', '#137a3a'],
  },
  {
    id: 'blue',
    label: 'Blue',
    stops: ['#dce7f2', '#8bb6df', '#3d82c4', '#0e4f8f'],
  },
  {
    id: 'warm',
    label: 'Warm (grey → amber → red)',
    stops: ['#cfd4da', '#e2b15a', '#e07f2e', '#c23b2b'],
  },
  {
    id: 'viridis',
    label: 'Viridis-like',
    stops: ['#440154', '#3b528b', '#21908d', '#5dc963', '#fde725'],
  },
];
/* eslint-enable theme-colors/no-literal-colors */

function clamp01(t: number): number {
  if (t < 0) return 0;
  if (t > 1) return 1;
  return t;
}

function hexToRgb01(hex: string): [number, number, number] {
  const h = hex.replace('#', '');
  return [
    parseInt(h.slice(0, 2), 16) / 255,
    parseInt(h.slice(2, 4), 16) / 255,
    parseInt(h.slice(4, 6), 16) / 255,
  ];
}

// Resolve a scale by id, falling back to the first (never undefined/throw).
function resolveScale(scaleId: string): GradientScale {
  return GRADIENT_SCALES.find(s => s.id === scaleId) ?? GRADIENT_SCALES[0];
}

// Sample scale at t (clamped [0,1]) → rgb 0..1 for xeokit colorize, linearly interpolated.
export function sampleScale(
  scaleId: string,
  t: number,
): [number, number, number] {
  const { stops } = resolveScale(scaleId);
  const clamped = clamp01(t);
  // Exact endpoints avoid float drift.
  if (clamped <= 0) return hexToRgb01(stops[0]);
  if (clamped >= 1) return hexToRgb01(stops[stops.length - 1]);
  const segments = stops.length - 1;
  const scaled = clamped * segments;
  const i = Math.min(Math.floor(scaled), segments - 1);
  const localT = scaled - i;
  const a = hexToRgb01(stops[i]);
  const b = hexToRgb01(stops[i + 1]);
  return [
    a[0] + (b[0] - a[0]) * localT,
    a[1] + (b[1] - a[1]) * localT,
    a[2] + (b[2] - a[2]) * localT,
  ];
}

// CSS linear-gradient mirroring the scale, for the legend bar.
export function scaleCssGradient(scaleId: string): string {
  const { stops } = resolveScale(scaleId);
  return `linear-gradient(90deg, ${stops.join(', ')})`;
}
