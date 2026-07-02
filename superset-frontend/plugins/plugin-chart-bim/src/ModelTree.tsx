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
  useEffect,
  useMemo,
  useState,
  type MouseEvent as ReactMouseEvent,
} from 'react';
import { t } from '@apache-superset/core/translation';
import { styled } from '@apache-superset/core/theme';
import { Button, Input, Tree, type TreeDataNode } from '@superset-ui/core/components';
import { TreeNode, XeokitApi } from './types';

const DEFAULT_PANEL_WIDTH = 280;
const MIN_PANEL_WIDTH = 200;
const MAX_PANEL_WIDTH = 600;
// Height budget for the virtualized tree list. antd Tree virtualizes its rows
// when a numeric `height` is set, so only visible rows hit the DOM — this is
// what keeps large models (thousands of elements) from freezing the browser.
const TREE_HEIGHT = 480;

const Wrap = styled.div`
  position: absolute;
  top: 0;
  left: 0;
  height: 100%;
  z-index: 10;
  pointer-events: none;
`;

const Panel = styled.div<{ open: boolean; width: number }>`
  position: absolute;
  top: 0;
  left: 0;
  width: ${({ width }) => width}px;
  height: 100%;
  display: flex;
  flex-direction: column;
  gap: ${({ theme }) => theme.sizeUnit}px;
  padding: ${({ theme }) => theme.sizeUnit * 2}px;
  background: ${({ theme }) => theme.colorBgContainer};
  border-right: 1px solid ${({ theme }) => theme.colorBorder};
  overflow: hidden;
  pointer-events: auto;
  transform: translateX(${({ open, width }) => (open ? '0' : `-${width}px`)});
  transition: transform 200ms ease;
`;

// Draggable strip on the panel's right edge; drag to resize the panel width.
const ResizeHandle = styled.div`
  position: absolute;
  top: 0;
  right: 0;
  width: ${({ theme }) => theme.sizeUnit}px;
  height: 100%;
  cursor: col-resize;
  pointer-events: auto;
  background: transparent;
  &:hover {
    background: ${({ theme }) => theme.colorBorder};
  }
`;

const Toggle = styled.button<{ open: boolean; width: number }>`
  position: absolute;
  top: 50%;
  left: ${({ open, width }) => (open ? `${width}px` : '0')};
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

// Secondary label showing IFC type next to the primary node name.
const NodeType = styled.small`
  color: ${({ theme }) => theme.colorTextTertiary};
  font-size: 0.8em;
  margin-left: ${({ theme }) => theme.sizeUnit}px;
`;

// A leaf is a node with no children. Return the leaf ids reachable from `node`.
function collectLeafIds(node: TreeNode): string[] {
  if (node.children.length === 0) return [node.id];
  return node.children.flatMap(collectLeafIds);
}

// Ids of every node that has children — used to expand all matches while a
// search is active (collapsed branches would hide the matched descendants).
function collectParentIds(nodes: TreeNode[]): string[] {
  return nodes.flatMap(n =>
    n.children.length ? [n.id, ...collectParentIds(n.children)] : [],
  );
}

// Ids of only the top level, so the tree opens collapsed to roots by default
// instead of rendering every descendant at once.
function topLevelIds(nodes: TreeNode[]): string[] {
  return nodes.filter(n => n.children.length).map(n => n.id);
}

function toAntdNodes(
  nodes: TreeNode[],
  onSelectNode: (id: string) => void,
): TreeDataNode[] {
  return nodes.map(n => ({
    key: n.id,
    // Render name as its own text node so RTL getByText('Wall A') matches it
    // directly, then append the IFC type as smaller secondary text. Clicking the
    // label selects the node directly, so Isolate works regardless of whether
    // antd's own onSelect fires through the custom title / virtualized rows.
    title: (
      <span onClick={() => onSelectNode(n.id)}>
        {n.name}
        {n.type ? <NodeType>{n.type}</NodeType> : null}
      </span>
    ),
    children: n.children.length
      ? toAntdNodes(n.children, onSelectNode)
      : undefined,
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
  const [width, setWidth] = useState(DEFAULT_PANEL_WIDTH);
  // Controlled expansion so the tree starts collapsed to its top level and
  // auto-expands to reveal matches while a search query is active.
  const [expandedKeys, setExpandedKeys] = useState<string[]>([]);

  // Drag the right-edge handle to resize the panel. Listeners are attached to
  // the window during the drag so the pointer can leave the handle.
  const startResize = (e: ReactMouseEvent) => {
    e.preventDefault();
    const startX = e.clientX;
    const startWidth = width;
    const onMove = (move: MouseEvent) => {
      const next = startWidth + (move.clientX - startX);
      setWidth(Math.min(MAX_PANEL_WIDTH, Math.max(MIN_PANEL_WIDTH, next)));
    };
    const onUp = () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  };

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

  // Re-sync checkboxes when tree or api changes (e.g. after model reload).
  useEffect(() => {
    setCheckedKeys(initialCheckedKeys);
  }, [initialCheckedKeys]);

  const filtered = useMemo(
    () => (tree ? filterTree(tree, query) : []),
    [tree, query],
  );
  const antdData = useMemo(
    () => toAntdNodes(filtered, setSelected),
    [filtered],
  );

  // With no search, collapse to the top level. With a search, expand every
  // branch of the filtered tree so matches are visible.
  useEffect(() => {
    if (query.trim()) {
      setExpandedKeys(collectParentIds(filtered));
    } else {
      setExpandedKeys(topLevelIds(filtered));
    }
  }, [query, filtered]);

  // Re-read visibility from the scene and update the checkbox state to match.
  // Uses the FULL tree (allLeafIds), not the filtered subset, because showAll
  // and isolate are scene-global operations — they can affect elements that are
  // currently invisible in the search filter. In contrast, onCheck (below)
  // intentionally limits its scope to the filtered view so that toggling a node
  // does not accidentally mutate elements that are hidden by the search query.
  const syncFromScene = () => {
    if (!api) return;
    const vis = api.getVisibility();
    setCheckedKeys(allLeafIds.filter(id => vis[id] !== false));
  };

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
    // Only touch leaves that are present in the currently filtered tree.
    // Leaves outside the active filter are left unchanged, so a search for
    // "wall" + uncheck of Wall A does not accidentally hide Door B.
    const visibleLeafIds = filtered.flatMap(collectLeafIds);
    const hidden = visibleLeafIds.filter(id => !checkedLeaves.has(id));
    const shown = visibleLeafIds.filter(id => checkedLeaves.has(id));
    api.setVisible(shown, true);
    api.setVisible(hidden, false);
    setCheckedKeys(keys);
  };

  return (
    <Wrap>
      <Panel open={open} width={width} data-test="model-tree-panel">
        <Input
          placeholder={t('Search')}
          value={query}
          onChange={e => setQuery(e.target.value)}
          allowClear
        />
        <Controls>
          <Button
            buttonSize="small"
            disabled={!api}
            onClick={() => {
              api?.showAll();
              syncFromScene();
            }}
          >
            {t('Show all')}
          </Button>
          <Button
            buttonSize="small"
            disabled={!selected}
            onClick={() => {
              if (!api || !tree || !selected) return;
              const node = findNode(tree, selected);
              if (node) {
                api.isolate(collectLeafIds(node));
                syncFromScene();
              }
            }}
          >
            {t('Isolate')}
          </Button>
        </Controls>
        {open && tree ? (
          <Tree
            checkable
            checkStrictly={false}
            selectable
            height={TREE_HEIGHT}
            treeData={antdData}
            checkedKeys={checkedKeys}
            expandedKeys={expandedKeys}
            selectedKeys={selected ? [selected] : []}
            onExpand={keys => setExpandedKeys(keys as string[])}
            onCheck={onCheck}
            onSelect={keys => setSelected(keys[0] as string | undefined)}
          />
        ) : open ? (
          <Empty>
            {t('No element hierarchy available for this model.')}
          </Empty>
        ) : null}
        <ResizeHandle
          data-test="model-tree-resize"
          onMouseDown={startResize}
        />
      </Panel>
      <Toggle
        open={open}
        width={width}
        data-test="model-tree-toggle"
        aria-label={t('Toggle element tree')}
        onClick={() => setOpen(o => !o)}
      >
        {open ? '◀' : '▶'}
      </Toggle>
    </Wrap>
  );
}
