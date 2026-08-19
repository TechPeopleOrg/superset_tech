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
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type MouseEvent as ReactMouseEvent,
} from 'react';
import { t } from '@apache-superset/core/translation';
import { styled } from '@apache-superset/core/theme';
import {
  Button,
  Icons,
  Input,
  Tree,
  type TreeDataNode,
} from '@superset-ui/core/components';
import { TreeNode, XeokitApi } from './types';

const DEFAULT_PANEL_WIDTH = 280;
const MIN_PANEL_WIDTH = 200;
const MAX_PANEL_WIDTH = 600;
// antd renders no rows at height 0, which is what an unlaid-out panel measures.
const MIN_TREE_HEIGHT = 120;

// Above the other overlays (all at 10) so they don't show through the panel.
const Wrap = styled.div`
  position: absolute;
  top: 0;
  left: 0;
  height: 100%;
  z-index: 20;
  pointer-events: none;
`;

const Panel = styled.div<{ open: boolean; width: number }>`
  position: absolute;
  top: ${({ theme }) => theme.sizeUnit * 2}px;
  left: ${({ theme }) => theme.sizeUnit * 2}px;
  bottom: ${({ theme }) => theme.sizeUnit * 2}px;
  width: ${({ width }) => width}px;
  display: flex;
  flex-direction: column;
  gap: ${({ theme }) => theme.sizeUnit}px;
  padding: ${({ theme }) => theme.sizeUnit * 2}px;
  background: ${({ theme }) => theme.colorBgElevated};
  border: 1px solid ${({ theme }) => theme.colorBorderSecondary};
  border-radius: ${({ theme }) => theme.borderRadius}px;
  box-shadow: ${({ theme }) => theme.boxShadowSecondary};
  overflow: hidden;
  pointer-events: ${({ open }) => (open ? 'auto' : 'none')};
  opacity: ${({ open }) => (open ? 1 : 0)};
  transform: translateX(
    ${({ open, theme, width }) =>
      open ? '0' : `-${width + theme.sizeUnit * 3}px`}
  );
  transition:
    transform 200ms ease,
    opacity 200ms ease;
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

// Search field + close button on one row at the top of the panel.
const Header = styled.div`
  display: flex;
  align-items: stretch;
  gap: ${({ theme }) => theme.sizeUnit}px;

  > button {
    height: auto;
    align-self: stretch;
  }
`;

const Controls = styled.div`
  display: flex;
  gap: ${({ theme }) => theme.sizeUnit * 2}px;
  margin-top: ${({ theme }) => theme.sizeUnit}px;
  padding-bottom: ${({ theme }) => theme.sizeUnit * 2}px;
  border-bottom: 1px solid ${({ theme }) => theme.colorBorderSecondary};

  > button {
    flex: 1;
    height: ${({ theme }) => theme.sizeUnit * 7}px;
    padding: 0 ${({ theme }) => theme.sizeUnit * 2}px;
    font-size: ${({ theme }) => theme.fontSizeSM}px;
    border-radius: ${({ theme }) => theme.borderRadius}px;
  }
`;

// Leftover space below the header; min-height:0 lets it shrink below content.
const TreeArea = styled.div`
  flex: 1;
  min-height: 0;

  .ant-tree-checkbox {
    transform: scale(0.85);
  }

  .ant-tree-node-content-wrapper {
    font-size: ${({ theme }) => theme.fontSizeSM}px;
  }
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

// Element height, so the tree fits the panel instead of a fixed guess.
function useMeasuredHeight(ref: React.RefObject<HTMLElement>): number {
  const [height, setHeight] = useState(MIN_TREE_HEIGHT);
  useEffect(() => {
    const node = ref.current;
    if (!node || typeof ResizeObserver === 'undefined') return undefined;
    const measure = () =>
      setHeight(Math.max(MIN_TREE_HEIGHT, Math.floor(node.clientHeight)));
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(node);
    return () => observer.disconnect();
  }, [ref]);
  return height;
}

// Ids of every node that has children — used to expand all matches while a
// search is active (collapsed branches would hide the matched descendants).
// Iterative: recursion overflows the stack on large trees.
function collectParentIds(nodes: TreeNode[]): string[] {
  const out: string[] = [];
  const stack: TreeNode[] = [...nodes];
  while (stack.length) {
    const n = stack.pop() as TreeNode;
    if (!n.children.length) continue;
    out.push(n.id);
    for (let i = 0; i < n.children.length; i++) {
      stack.push(n.children[i]);
    }
  }
  return out;
}

// Ids of only the top level, so the tree opens collapsed to roots by default
// instead of rendering every descendant at once.
function topLevelIds(nodes: TreeNode[]): string[] {
  return nodes.filter(n => n.children.length).map(n => n.id);
}

// Plain data only; titleRender builds titles lazily for visible rows.
function toAntdNodes(nodes: TreeNode[]): TreeDataNode[] {
  return nodes.map(n => ({
    key: n.id,
    name: n.name,
    type: n.type,
    children: n.children.length ? toAntdNodes(n.children) : undefined,
  })) as TreeDataNode[];
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

// Per-node leaf ids, built once so checks stay O(1) instead of quadratic.
type TreeIndex = {
  leavesOf: Map<string, string[]>;
};

function indexTree(nodes: TreeNode[]): TreeIndex {
  const leavesOf = new Map<string, string[]>();

  // Iterative post-order: recursion overflows the stack on deep hierarchies.
  const stack: { node: TreeNode; visited: boolean }[] = nodes.map(node => ({
    node,
    visited: false,
  }));
  while (stack.length) {
    const frame = stack.pop() as { node: TreeNode; visited: boolean };
    const { node } = frame;
    if (!frame.visited) {
      if (node.children.length === 0) {
        leavesOf.set(node.id, [node.id]);
        continue;
      }
      stack.push({ node, visited: true });
      for (const child of node.children) {
        stack.push({ node: child, visited: false });
      }
      continue;
    }
    const leaves: string[] = [];
    for (const child of node.children) {
      const childLeaves = leavesOf.get(child.id);
      if (!childLeaves) continue;
      // Plain loop, not push(...spread): spread exceeds the argument limit.
      for (let i = 0; i < childLeaves.length; i++) {
        leaves.push(childLeaves[i]);
      }
    }
    leavesOf.set(node.id, leaves);
  }
  return { leavesOf };
}

export default function ModelTree({
  tree,
  api,
  open,
  onClose,
}: {
  tree?: TreeNode[];
  api?: XeokitApi;
  // Whether the panel is shown. Controlled by the parent so the viewer toolbar
  // is the single place that toggles the tree.
  open: boolean;
  // Called when the panel's own close affordance is used.
  onClose: () => void;
}) {
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState<string | undefined>();
  const [width, setWidth] = useState(DEFAULT_PANEL_WIDTH);
  // Controlled expansion so the tree starts collapsed to its top level and
  // auto-expands to reveal matches while a search query is active.
  const [expandedKeys, setExpandedKeys] = useState<string[]>([]);
  const treeAreaRef = useRef<HTMLDivElement>(null);
  const treeHeight = useMeasuredHeight(treeAreaRef);

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

  // Unfiltered index: Isolate and showAll must resolve ids the filter hid.
  const fullIndex = useMemo(() => indexTree(tree ?? []), [tree]);
  const allLeafIds = useMemo(
    () => (tree ? tree.flatMap(n => fullIndex.leavesOf.get(n.id) ?? []) : []),
    [tree, fullIndex],
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
  const filteredIndex = useMemo(() => indexTree(filtered), [filtered]);
  // Leaves of the filtered view, recomputed only when the filter changes.
  const visibleLeafIds = useMemo(
    () => filtered.flatMap(n => filteredIndex.leavesOf.get(n.id) ?? []),
    [filtered, filteredIndex],
  );
  const antdData = useMemo(() => toAntdNodes(filtered), [filtered]);

  // Click handled here: antd's onSelect is unreliable for virtualized rows.
  const titleRender = useCallback(
    (node: TreeDataNode) => {
      const { key } = node;
      const { name, type } = node as TreeDataNode & {
        name?: string;
        type?: string;
      };
      return (
        <span onClick={() => setSelected(key as string)}>
          {name ?? String(key)}
          {type ? <NodeType>{type}</NodeType> : null}
        </span>
      );
    },
    [setSelected],
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
    const checkedLeaves = new Set<string>();
    for (const k of keys) {
      const leaves = filteredIndex.leavesOf.get(k);
      if (leaves) {
        for (const id of leaves) checkedLeaves.add(id);
      }
    }
    // Only touch leaves that are present in the currently filtered tree.
    // Leaves outside the active filter are left unchanged, so a search for
    // "wall" + uncheck of Wall A does not accidentally hide Door B.
    const hidden = visibleLeafIds.filter(id => !checkedLeaves.has(id));
    const shown = visibleLeafIds.filter(id => checkedLeaves.has(id));
    api.setVisible(shown, true);
    api.setVisible(hidden, false);
    setCheckedKeys(keys);
  };

  return (
    <Wrap data-test="model-tree-wrap">
      <Panel open={open} width={width} data-test="model-tree-panel">
        <Header>
          <Input
            placeholder={t('Search')}
            value={query}
            onChange={e => setQuery(e.target.value)}
            allowClear
          />
          <Button
            buttonSize="xsmall"
            buttonStyle="tertiary"
            data-test="model-tree-close"
            aria-label={t('Close element tree')}
            onClick={onClose}
            icon={<Icons.CloseOutlined />}
          />
        </Header>
        <Controls>
          <Button
            buttonSize="small"
            buttonStyle="tertiary"
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
            buttonStyle="tertiary"
            disabled={!selected}
            onClick={() => {
              if (!api || !tree || !selected) return;
              const leaves = fullIndex.leavesOf.get(selected);
              if (leaves) {
                api.isolate(leaves);
                syncFromScene();
              }
            }}
          >
            {t('Isolate')}
          </Button>
        </Controls>
        <TreeArea ref={treeAreaRef} data-test="model-tree-area">
          {open && tree ? (
            <Tree
              checkable
              checkStrictly={false}
              selectable
              height={treeHeight}
              treeData={antdData}
              titleRender={titleRender}
              checkedKeys={checkedKeys}
              expandedKeys={expandedKeys}
              selectedKeys={selected ? [selected] : []}
              onExpand={keys => setExpandedKeys(keys as string[])}
              onCheck={onCheck}
              onSelect={keys => setSelected(keys[0] as string | undefined)}
            />
          ) : open ? (
            <Empty>{t('No element hierarchy available for this model.')}</Empty>
          ) : null}
        </TreeArea>
        <ResizeHandle data-test="model-tree-resize" onMouseDown={startResize} />
      </Panel>
    </Wrap>
  );
}
