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
import type { MetaObjectLike } from './buildTree';
import type { ObjectInfo } from './types';

// Ancestor display names, root-first, excluding the object itself.
export function buildObjectPath(
  metaObjects: Record<string, MetaObjectLike>,
  id: string,
): string[] {
  const out: string[] = [];
  const seen = new Set<string>([id]);
  let current = metaObjects[id]?.parent?.id;
  while (current && !seen.has(current)) {
    seen.add(current);
    const mo = metaObjects[current];
    if (!mo) break;
    out.unshift(mo.name || mo.id);
    current = mo.parent?.id;
  }
  return out;
}

// Ancestor ids, nearest-first — the order row resolution climbs in.
export function buildAncestorIds(
  metaObjects: Record<string, MetaObjectLike>,
  id: string,
): string[] {
  const out: string[] = [];
  const seen = new Set<string>([id]);
  let current = metaObjects[id]?.parent?.id;
  while (current && !seen.has(current)) {
    seen.add(current);
    if (!metaObjects[current]) break;
    out.push(current);
    current = metaObjects[current].parent?.id;
  }
  return out;
}

export interface ResolvedRow {
  row?: DataRecord;
  // Ancestor the row came from; undefined for a direct hit.
  inheritedFrom?: string;
}

// Find the dataset row for a clicked object, climbing to an ancestor when the
// picked geometry leaf has no row of its own.
export function resolveRowForObject(
  rows: DataRecord[],
  linkColumn: string | undefined,
  info: ObjectInfo,
  ancestorNames: string[],
): ResolvedRow {
  if (!linkColumn) return { row: undefined, inheritedFrom: undefined };
  // Link values arrive typed from the query while ids are strings.
  const findRow = (gid: string) =>
    rows.find(r => {
      const value = r[linkColumn];
      return value !== null && value !== undefined && String(value) === gid;
    });

  const own = findRow(info.id);
  if (own) return { row: own, inheritedFrom: undefined };

  for (let i = 0; i < info.ancestorIds.length; i += 1) {
    const row = findRow(info.ancestorIds[i]);
    if (row) {
      return { row, inheritedFrom: ancestorNames[i] ?? info.ancestorIds[i] };
    }
  }
  return { row: undefined, inheritedFrom: undefined };
}
