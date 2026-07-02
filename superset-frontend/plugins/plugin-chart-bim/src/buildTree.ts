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
import { TreeNode } from './types';

// Minimal shape of a xeokit metaObject the tree builder relies on.
export interface MetaObjectLike {
  id: string;
  name?: string;
  type?: string;
  parent?: string;
}

// Turn a flat map of metaObjects into a containment forest. An object is a root
// when it has no parent, or its parent id is not present in the map.
export default function buildTree(
  metaObjects: Record<string, MetaObjectLike>,
): TreeNode[] {
  const nodes: Record<string, TreeNode> = {};
  Object.values(metaObjects).forEach(mo => {
    nodes[mo.id] = {
      id: mo.id,
      name: mo.name || mo.id,
      type: mo.type || '',
      children: [],
    };
  });

  const roots: TreeNode[] = [];
  Object.values(metaObjects).forEach(mo => {
    const node = nodes[mo.id];
    const parent = mo.parent ? nodes[mo.parent] : undefined;
    if (parent) {
      parent.children.push(node);
    } else {
      roots.push(node);
    }
  });
  return roots;
}
