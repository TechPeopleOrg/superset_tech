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
import { DataRecord } from '@superset-ui/core';

export interface ColorMappingInput {
  rows: DataRecord[];
  linkColumn: string;
  colorBy: string;
  colorFn: (value: string) => string;
  overrides?: { value: string; color: string }[];
}

export interface ColorMappingResult {
  colorById: Map<string, [number, number, number]>;
  legend: { value: string; color: string }[];
  stats: { dataKeys: number };
}

// True only for a #rrggbb hex string. Named CSS colors ("red") and other
// formats are rejected so they never reach hexToRgb01 and produce NaN colors.
export function isHexColor(color: string): boolean {
  return /^#[0-9a-fA-F]{6}$/.test(color);
}

// Convert a #rrggbb hex string to an rgb triple in the 0..1 range that
// xeokit's `entity.colorize` expects. A non-hex input (e.g. an rgba() theme
// token or a CSS name) would parse to NaN channels, which xeokit renders as a
// solid colour ([NaN, x, NaN] -> green); guard against that with a neutral
// grey fallback so a bad colour never silently paints the whole model.
export function hexToRgb01(hex: string): [number, number, number] {
  if (!isHexColor(hex)) return [0.8, 0.8, 0.8];
  const h = hex.replace('#', '');
  const r = parseInt(h.slice(0, 2), 16) / 255;
  const g = parseInt(h.slice(2, 4), 16) / 255;
  const b = parseInt(h.slice(4, 6), 16) / 255;
  return [r, g, b];
}

export default function buildColorMapping(
  input: ColorMappingInput,
): ColorMappingResult {
  const { rows, linkColumn, colorBy, colorFn, overrides } = input;
  // Only keep overrides whose color is a valid #rrggbb hex; anything else
  // (e.g. a CSS name like "red") falls through to the automatic palette
  // instead of producing NaN colors that xeokit renders as black.
  const overrideMap = new Map(
    (overrides ?? [])
      .filter(o => isHexColor(o.color))
      .map(o => [o.value, o.color]),
  );

  const colorById = new Map<string, [number, number, number]>();
  const legendColors = new Map<string, string>(); // value -> hex, first-seen order

  rows.forEach(row => {
    const raw = row[colorBy];
    if (raw === null || raw === undefined || raw === '') return;
    const value = String(raw);
    const id = String(row[linkColumn]);

    let hex = legendColors.get(value);
    if (hex === undefined) {
      hex = overrideMap.get(value) ?? colorFn(value);
      legendColors.set(value, hex);
    }
    colorById.set(id, hexToRgb01(hex));
  });

  const legend = Array.from(legendColors.entries()).map(([value, color]) => ({
    value,
    color,
  }));
  return { colorById, legend, stats: { dataKeys: colorById.size } };
}
