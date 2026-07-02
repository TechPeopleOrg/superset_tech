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
import { useMemo, useState } from 'react';
import { t } from '@apache-superset/core/translation';
import { styled } from '@apache-superset/core/theme';
import { Button, Input, Tree, type TreeDataNode } from '@superset-ui/core/components';
import { TreeNode, XeokitApi } from './types';

const PANEL_WIDTH = 280;

const Wrap = styled.div`
  position: absolute;
  top: 0;
  left: 0;
  height: 100%;
  z-index: 10;
  pointer-events: none;
`;

const Panel = styled.div<{ open: boolean }>`
  position: absolute;
  top: 0;
  left: 0;
  width: ${PANEL_WIDTH}px;
  height: 100%;
  display: flex;
  flex-direction: column;
  gap: ${({ theme }) => theme.sizeUnit}px;
  padding: ${({ theme }) => theme.sizeUnit * 2}px;
  background: ${({ theme }) => theme.colorBgContainer};
  border-right: 1px solid ${({ theme }) => theme.colorBorder};
  overflow: auto;
  pointer-events: auto;
  transform: translateX(${({ open }) => (open ? '0' : `-${PANEL_WIDTH}px`)});
  transition: transform 200ms ease;
`;

const Toggle = styled.button<{ open: boolean }>`
  position: absolute;
  top: 50%;
  left: ${({ open }) => (open ? `${PANEL_WIDTH}px` : '0')};
  transform: translateY(-50%);
  z-index: 11;
  pointer-events: auto;
  cursor: pointer;
  border: 1px solid ${({ theme }) => theme.colorBorder};
  border-left: none;
  background: ${({ theme }) => theme.colorBgContainer};
  padding: ${({ theme }) => theme.sizeUnit * 2}px
    ${({ theme }) => theme.sizeUnit}px;
  transition: left 200ms ease;
`;

const Controls = styled.div`
  display: flex;
  gap: ${({ theme }) => theme.sizeUnit}px;
`;

const Empty = styled.div`
  color: ${({ theme }) => theme.colorTextTertiary};
  padding: ${({ theme }) => theme.sizeUnit * 2}px;
`;

// A leaf is a node with no children. Return the leaf ids reachable from `node`.
function collectLeafIds(node: TreeNode): string[] {
  if (node.children.length === 0) return [node.id];
  return node.children.flatMap(collectLeafIds);
}

function toAntdNodes(nodes: TreeNode[]): TreeDataNode[] {
  return nodes.map(n => ({
    key: n.id,
    title: n.name,
    children: n.children.length ? toAntdNodes(n.children) : undefined,
  }));
}

// Keep only nodes whose own name (or a descendant's) matches the query.
function filterTree(nodes: TreeNode[], q: string): TreeNode[] {
  const query = q.trim().toLowerCase();
  if (!query) return nodes;
  const walk = (n: TreeNode): TreeNode | undefined => {
    const kids = n.children.map(walk).filter((c): c is TreeNode => !!c);
    if (n.name.toLowerCase().includes(query) || kids.length) {
      return { ...n, children: kids };
    }
    return undefined;
  };
  return nodes.map(walk).filter((n): n is TreeNode => !!n);
}

function findNode(nodes: TreeNode[], id: string): TreeNode | undefined {
  for (const n of nodes) {
    if (n.id === id) return n;
    const found = findNode(n.children, id);
    if (found) return found;
  }
  return undefined;
}

export default function ModelTree({
  tree,
  api,
}: {
  tree?: TreeNode[];
  api?: XeokitApi;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState<string | undefined>();

  const allLeafIds = useMemo(
    () => (tree ? tree.flatMap(collectLeafIds) : []),
    [tree],
  );

  // Derive initial checked keys from the live visibility state so the tree
  // reflects what is actually visible in the viewer on first render.
  const initialCheckedKeys = useMemo(() => {
    if (!tree || !api) return [];
    const visibility = api.getVisibility();
    return allLeafIds.filter(id => visibility[id] !== false);
  }, [tree, api, allLeafIds]);

  const [checkedKeys, setCheckedKeys] = useState<string[]>(initialCheckedKeys);

  const filtered = useMemo(
    () => (tree ? filterTree(tree, query) : []),
    [tree, query],
  );
  const antdData = useMemo(() => toAntdNodes(filtered), [filtered]);

  const onCheck = (rawCheckedKeys: unknown) => {
    if (!api || !tree) return;
    const keys = Array.isArray(rawCheckedKeys)
      ? (rawCheckedKeys as string[])
      : ((rawCheckedKeys as { checked: string[] }).checked ?? []);
    const checkedLeaves = new Set(
      keys.flatMap(k => {
        const node = findNode(tree, k);
        return node ? collectLeafIds(node) : [];
      }),
    );
    const hidden = allLeafIds.filter(id => !checkedLeaves.has(id));
    api.setVisible(Array.from(checkedLeaves), true);
    api.setVisible(hidden, false);
    setCheckedKeys(keys);
  };

  return (
    <Wrap>
      <Panel open={open} data-test="model-tree-panel">
        <Input
          placeholder={t('Search')}
          value={query}
          onChange={e => setQuery(e.target.value)}
          allowClear
        />
        <Controls>
          <Button buttonSize="small" onClick={() => api?.showAll()}>
            {t('Show all')}
          </Button>
          <Button
            buttonSize="small"
            disabled={!selected}
            onClick={() => {
              if (!api || !tree || !selected) return;
              const node = findNode(tree, selected);
              if (node) api.isolate(collectLeafIds(node));
            }}
          >
            {t('Isolate')}
          </Button>
        </Controls>
        {open && tree ? (
          <Tree
            checkable
            selectable
            defaultExpandAll
            treeData={antdData}
            checkedKeys={checkedKeys}
            onCheck={onCheck}
            onSelect={keys => setSelected(keys[0] as string | undefined)}
          />
        ) : open ? (
          <Empty>
            {t('No element hierarchy available for this model.')}
          </Empty>
        ) : null}
      </Panel>
      <Toggle
        open={open}
        data-test="model-tree-toggle"
        aria-label={t('Toggle element tree')}
        onClick={() => setOpen(o => !o)}
      >
        {open ? '◀' : '▶'}
      </Toggle>
    </Wrap>
  );
}
