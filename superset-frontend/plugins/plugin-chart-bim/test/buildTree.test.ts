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
import buildTree, { MetaObjectLike } from '../src/buildTree';

const meta = (
  entries: MetaObjectLike[],
): Record<string, MetaObjectLike> =>
  entries.reduce<Record<string, MetaObjectLike>>((acc, e) => {
    acc[e.id] = e;
    return acc;
  }, {});

test('returns [] for empty metadata', () => {
  expect(buildTree({})).toEqual([]);
});

test('builds a containment hierarchy from parent object references', () => {
  const tree = buildTree(
    meta([
      { id: 'proj', name: 'Project', type: 'IfcProject' },
      {
        id: 'storey',
        name: 'Level 1',
        type: 'IfcBuildingStorey',
        parent: { id: 'proj' },
      },
      { id: 'wall', name: 'Wall A', type: 'IfcWall', parent: { id: 'storey' } },
    ]),
  );
  expect(tree).toEqual([
    {
      id: 'proj',
      name: 'Project',
      type: 'IfcProject',
      children: [
        {
          id: 'storey',
          name: 'Level 1',
          type: 'IfcBuildingStorey',
          children: [
            { id: 'wall', name: 'Wall A', type: 'IfcWall', children: [] },
          ],
        },
      ],
    },
  ]);
});

test('falls back name->id and type->empty when missing', () => {
  const tree = buildTree(meta([{ id: 'x' }]));
  expect(tree).toEqual([{ id: 'x', name: 'x', type: '', children: [] }]);
});

test('treats an object with an unknown parent as a root', () => {
  const tree = buildTree(meta([{ id: 'orphan', parent: { id: 'ghost' } }]));
  expect(tree.map(n => n.id)).toEqual(['orphan']);
});

test('keeps container nodes on the path to geometry, prunes the rest', () => {
  const tree = buildTree(
    meta([
      { id: 'proj', name: 'Project', type: 'IfcProject' },
      { id: 'storey', name: 'Level 1', parent: { id: 'proj' } },
      { id: 'wall', name: 'Wall A', parent: { id: 'storey' } },
      // Property set: metadata only, no geometry, must be pruned.
      { id: 'pset', name: 'Pset_Common', parent: { id: 'wall' } },
    ]),
    new Set(['wall']),
  );
  // proj > storey kept because they lead to the geometric wall; pset dropped.
  expect(tree).toEqual([
    {
      id: 'proj',
      name: 'Project',
      type: 'IfcProject',
      children: [
        {
          id: 'storey',
          name: 'Level 1',
          type: '',
          children: [{ id: 'wall', name: 'Wall A', type: '', children: [] }],
        },
      ],
    },
  ]);
});

test('prunes a whole branch that has no geometry', () => {
  const tree = buildTree(
    meta([
      { id: 'proj', name: 'Project' },
      { id: 'ghostStorey', name: 'Empty', parent: { id: 'proj' } },
    ]),
    new Set<string>(),
  );
  expect(tree).toEqual([]);
});
