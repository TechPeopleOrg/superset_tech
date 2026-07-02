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

// Minimal shape of a xeokit metaObject the tree builder relies on. In the real
// xeokit SDK `parent` is a reference to another MetaObject (or null), not an id
// string, so it is modelled here as an object carrying at least an `id`.
export interface MetaObjectLike {
  id: string;
  name?: string;
  type?: string;
  parent?: { id: string } | null;
}

// Build the containment forest from a flat map of metaObjects, keyed by id.
//
// `geometryIds`, when provided, restricts the tree to elements that actually
// have geometry in the scene: a node is kept only if it is itself geometric or
// has a geometric descendant. Container nodes (Project / Storey / Building) on
// the path to real geometry are preserved; metadata-only nodes (property sets,
// openings without geometry) are pruned. When `geometryIds` is omitted, every
// metaObject is kept.
export default function buildTree(
  metaObjects: Record<string, MetaObjectLike>,
  geometryIds?: Set<string>,
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
    const parentId = mo.parent?.id;
    const parent = parentId ? nodes[parentId] : undefined;
    if (parent) {
      parent.children.push(node);
    } else {
      roots.push(node);
    }
  });

  if (!geometryIds) return roots;

  // Prune branches with no geometric leaf. Returns the node when it or any
  // descendant has geometry, otherwise undefined.
  const prune = (node: TreeNode): TreeNode | undefined => {
    const kids = node.children
      .map(prune)
      .filter((c): c is TreeNode => !!c);
    if (geometryIds.has(node.id) || kids.length) {
      return { ...node, children: kids };
    }
    return undefined;
  };
  return roots.map(prune).filter((n): n is TreeNode => !!n);
}
