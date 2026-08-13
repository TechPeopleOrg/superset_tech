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
import { buildObjectPath, resolveRowForObject } from '../src/objectInfo';
import type { ObjectInfo } from '../src/types';

const metaObjects = {
  project: { id: 'project', name: 'Project', type: 'IfcProject' },
  storey: {
    id: 'storey',
    name: 'Level 1',
    type: 'IfcBuildingStorey',
    parent: { id: 'project' },
  },
  wall: {
    id: 'wall',
    name: 'Wall A',
    type: 'IfcWall',
    parent: { id: 'storey' },
  },
  leaf: { id: 'leaf', name: 'Wall A body', parent: { id: 'wall' } },
};

test('buildObjectPath returns ancestors root-first, excluding the object itself', () => {
  expect(buildObjectPath(metaObjects, 'wall')).toEqual(['Project', 'Level 1']);
});

test('buildObjectPath returns an empty path for a root object', () => {
  expect(buildObjectPath(metaObjects, 'project')).toEqual([]);
});

test('buildObjectPath falls back to the id when an ancestor has no name', () => {
  const unnamed = {
    root: { id: 'root' },
    child: { id: 'child', name: 'Child', parent: { id: 'root' } },
  };
  expect(buildObjectPath(unnamed, 'child')).toEqual(['root']);
});

test('buildObjectPath tolerates a parent id that is not in the map', () => {
  const orphan = {
    child: { id: 'child', name: 'Child', parent: { id: 'missing' } },
  };
  expect(buildObjectPath(orphan, 'child')).toEqual([]);
});

test('buildObjectPath terminates on a parent cycle instead of hanging', () => {
  const cyclic = {
    a: { id: 'a', name: 'A', parent: { id: 'b' } },
    b: { id: 'b', name: 'B', parent: { id: 'a' } },
  };
  // Each ancestor is visited at most once, so the walk ends.
  expect(buildObjectPath(cyclic, 'a')).toEqual(['B']);
});

test('buildObjectPath returns an empty path for an unknown object', () => {
  expect(buildObjectPath(metaObjects, 'nope')).toEqual([]);
});

const info = (id: string, path: string[] = []): ObjectInfo => ({
  id,
  name: id,
  type: 'IfcWall',
  path,
  ancestorIds: [],
});

test('resolveRowForObject finds the row matching the clicked object', () => {
  const rows = [
    { gid: 'wall', status: 'Done' },
    { gid: 'other', status: 'Late' },
  ];
  expect(resolveRowForObject(rows, 'gid', info('wall'), [])).toEqual({
    row: { gid: 'wall', status: 'Done' },
    inheritedFrom: undefined,
  });
});

test('resolveRowForObject climbs to the nearest ancestor that has a row', () => {
  const rows = [{ gid: 'wall', status: 'Done' }];
  const leaf: ObjectInfo = {
    id: 'leaf',
    name: 'Wall A body',
    type: '',
    path: ['Project', 'Level 1', 'Wall A'],
    // Nearest ancestor first, matching how the walk climbs.
    ancestorIds: ['wall', 'storey', 'project'],
  };
  expect(
    resolveRowForObject(rows, 'gid', leaf, ['Wall A', 'Level 1', 'Project']),
  ).toEqual({
    row: { gid: 'wall', status: 'Done' },
    inheritedFrom: 'Wall A',
  });
});

test('resolveRowForObject prefers the object own row over an ancestor row', () => {
  const rows = [
    { gid: 'leaf', status: 'Own' },
    { gid: 'wall', status: 'Ancestor' },
  ];
  const leaf: ObjectInfo = {
    id: 'leaf',
    name: 'leaf',
    type: '',
    path: [],
    ancestorIds: ['wall'],
  };
  expect(resolveRowForObject(rows, 'gid', leaf, ['Wall A'])).toEqual({
    row: { gid: 'leaf', status: 'Own' },
    inheritedFrom: undefined,
  });
});

test('resolveRowForObject returns no row when nothing in the chain matches', () => {
  const rows = [{ gid: 'elsewhere', status: 'Done' }];
  expect(resolveRowForObject(rows, 'gid', info('wall'), [])).toEqual({
    row: undefined,
    inheritedFrom: undefined,
  });
});

test('resolveRowForObject returns no row without a link column', () => {
  const rows = [{ gid: 'wall', status: 'Done' }];
  expect(resolveRowForObject(rows, undefined, info('wall'), [])).toEqual({
    row: undefined,
    inheritedFrom: undefined,
  });
});

test('resolveRowForObject compares link values as strings', () => {
  // Numeric link columns arrive as numbers from the query but ids are strings.
  const rows = [{ gid: 42, status: 'Done' }];
  expect(resolveRowForObject(rows, 'gid', info('42'), [])).toEqual({
    row: { gid: 42, status: 'Done' },
    inheritedFrom: undefined,
  });
});

test('resolveRowForObject ignores rows whose link value is null', () => {
  const rows = [{ gid: null, status: 'Done' }];
  expect(resolveRowForObject(rows, 'gid', info('wall'), [])).toEqual({
    row: undefined,
    inheritedFrom: undefined,
  });
});
