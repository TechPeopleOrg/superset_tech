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
import userEvent from '@testing-library/user-event';
import { render, screen } from 'spec/helpers/testing-library';
import ModelTree from '../src/ModelTree';
import { TreeNode, XeokitApi } from '../src/types';

const tree: TreeNode[] = [
  {
    id: 'proj',
    name: 'Project',
    type: 'IfcProject',
    children: [
      { id: 'wall', name: 'Wall A', type: 'IfcWall', children: [] },
      { id: 'door', name: 'Door B', type: 'IfcDoor', children: [] },
    ],
  },
];

const makeApi = (): XeokitApi => ({
  setVisible: jest.fn(),
  isolate: jest.fn(),
  showAll: jest.fn(),
  getVisibility: jest.fn().mockReturnValue({ wall: true, door: true }),
  colorize: jest.fn(),
  setOpacity: jest.fn(),
  resetColors: jest.fn(),
  expandToLeaves: jest.fn(() => []),
  allObjectIds: jest.fn(() => []),
  onPick: jest.fn(() => jest.fn()),
  highlight: jest.fn(),
  setHighlightColor: jest.fn(),
  getObjectInfo: jest.fn(() => undefined),
  fit: jest.fn(),
  onCameraChange: jest.fn(() => jest.fn()),
  flyToDir: jest.fn(),
});

// The panel is now controlled by the parent: `open` and `onClose` are required.
// Most tests want it open, so default to that and let callers override.
const renderTree = (props: Partial<Parameters<typeof ModelTree>[0]> = {}) => {
  const onClose = jest.fn();
  const result = render(
    <ModelTree tree={tree} api={makeApi()} open onClose={onClose} {...props} />,
  );
  return { onClose, ...result };
};

test('tree content is hidden while the panel is closed', () => {
  renderTree({ open: false });
  expect(screen.queryByText('Wall A')).not.toBeInTheDocument();
});

test('tree content is shown while the panel is open', () => {
  renderTree({ open: true });
  expect(screen.getByText('Wall A')).toBeInTheDocument();
});

test('the close button calls onClose', async () => {
  const { onClose } = renderTree({ open: true });
  await userEvent.click(screen.getByTestId('model-tree-close'));
  expect(onClose).toHaveBeenCalledTimes(1);
});

test('unchecking a leaf hides that element', async () => {
  const api = makeApi();
  renderTree({ api });
  // antd renders a checkbox per node; click the one associated with Wall A.
  const wallRow = screen.getByText('Wall A').closest('.ant-tree-treenode');
  const checkbox = wallRow!.querySelector('.ant-tree-checkbox');
  await userEvent.click(checkbox as Element);
  expect(api.setVisible).toHaveBeenCalledWith(
    expect.arrayContaining(['wall']),
    false,
  );
});

test('Show all calls api.showAll', async () => {
  const api = makeApi();
  renderTree({ api });
  await userEvent.click(screen.getByRole('button', { name: /show all/i }));
  expect(api.showAll).toHaveBeenCalled();
});

test('Isolate calls api.isolate with exactly the selected subtree leaves', async () => {
  const api = makeApi();
  renderTree({ api });
  await userEvent.click(screen.getByText('Project'));
  await userEvent.click(screen.getByRole('button', { name: /isolate/i }));
  // Must contain exactly wall and door — no extra ids like proj.
  const isolateArg = (api.isolate as jest.Mock).mock.calls[0][0] as string[];
  expect([...isolateArg].sort()).toEqual(['door', 'wall']);
});

test('search filters nodes by name', async () => {
  renderTree();
  await userEvent.type(screen.getByPlaceholderText(/search/i), 'door');
  expect(screen.getByText('Door B')).toBeInTheDocument();
  expect(screen.queryByText('Wall A')).not.toBeInTheDocument();
});

test('shows an empty-state message when there is no hierarchy', async () => {
  renderTree({ tree: undefined });
  expect(screen.getByText(/no element hierarchy/i)).toBeInTheDocument();
});

test('IFC type is shown as secondary text next to node name', async () => {
  renderTree();
  // The name remains a standalone text node for RTL matching.
  expect(screen.getByText('Wall A')).toBeInTheDocument();
  // The IFC type appears as separate secondary text.
  expect(screen.getByText('IfcWall')).toBeInTheDocument();
});

// Regression: isolate must sync checkedKeys to match scene visibility.
// Before the fix: api.isolate() changed scene state but checkedKeys was never
// updated, so the tree showed all boxes checked even after isolating a subtree.
// Strategy: mock getVisibility to return the post-isolate state (wall=true,
// door=false), click Isolate on "Wall A", then verify that getVisibility was
// called (syncFromScene ran) and the door checkbox lost its checked class.
// DOM-class assertion is stable because antd consistently uses
// .ant-tree-checkbox-checked for the checked state.
test('after Isolate checkedKeys sync from scene — door checkbox becomes unchecked', async () => {
  const api = makeApi();
  // After isolate("wall"), the scene will report door as hidden.
  (api.getVisibility as jest.Mock).mockReturnValue({ wall: true, door: false });
  renderTree({ api });

  // Select "Wall A" and click Isolate.
  await userEvent.click(screen.getByText('Wall A'));
  await userEvent.click(screen.getByRole('button', { name: /isolate/i }));

  // syncFromScene must have called getVisibility after the isolate.
  // The initial render also calls it once, so we expect >= 2 calls.
  expect(api.getVisibility).toHaveBeenCalledTimes(2);

  // The door row must no longer carry the checked class because visibility
  // was synced from the scene (getVisibility returned door=false).
  const doorRow = screen.getByText('Door B').closest('.ant-tree-treenode');
  expect(doorRow!.querySelector('.ant-tree-checkbox-checked')).toBeNull();
});

// Regression: showAll must sync checkedKeys to match scene visibility.
// Before the fix: api.showAll() restored all elements in the scene but
// checkedKeys remained stale — previously unchecked boxes stayed unchecked.
// Strategy: pre-render with door=false (door unchecked), click Show all,
// mock getVisibility to return all true for the sync call, then verify that
// the door checkbox is checked again.
test('after Show all checkedKeys sync from scene — all checkboxes become checked', async () => {
  const api = makeApi();
  // Initial state: door is hidden.
  (api.getVisibility as jest.Mock).mockReturnValue({ wall: true, door: false });
  renderTree({ api });

  // Now switch the mock to return all visible (what showAll produces in scene).
  (api.getVisibility as jest.Mock).mockReturnValue({ wall: true, door: true });
  await userEvent.click(screen.getByRole('button', { name: /show all/i }));

  // syncFromScene must have called getVisibility after showAll.
  // Expect >= 2 calls (1 on mount + 1 after showAll).
  expect(api.getVisibility).toHaveBeenCalledTimes(2);

  // Both wall and door checkboxes must be checked after the sync.
  const doorRow = screen.getByText('Door B').closest('.ant-tree-treenode');
  expect(doorRow!.querySelector('.ant-tree-checkbox-checked')).not.toBeNull();
});

// Regression: unchecking a filtered node must not affect nodes outside the filter.
// Before the fix: checking/unchecking in filtered view used allLeafIds, so
// removing Wall A while searching "wall" would also hide Door B.
test('uncheck in filtered view does not hide nodes outside the filter', async () => {
  const api = makeApi();
  renderTree({ api });

  // Filter to show only Wall A.
  await userEvent.type(screen.getByPlaceholderText(/search/i), 'wall');

  // Uncheck Wall A.
  const wallRow = screen.getByText('Wall A').closest('.ant-tree-treenode');
  const checkbox = wallRow!.querySelector('.ant-tree-checkbox');
  await userEvent.click(checkbox as Element);

  // setVisible(..., false) must never be called with 'door' in the array,
  // because door is outside the current filter and must not be touched.
  const hideCalls = (api.setVisible as jest.Mock).mock.calls.filter(
    ([, visible]) => visible === false,
  ) as [string[], boolean][];
  const hiddenIds = hideCalls.flatMap(([ids]) => ids);
  expect(hiddenIds).not.toContain('door');
});

// jsdom lacks ResizeObserver and sizes everything 0x0; stub both to measure.
const withMeasuredHeight = (clientHeight: number) => {
  const observers: (() => void)[] = [];
  (global as unknown as { ResizeObserver: unknown }).ResizeObserver = class {
    constructor(cb: () => void) {
      observers.push(cb);
    }

    observe() {}

    disconnect() {}
  };
  const spy = jest
    .spyOn(HTMLElement.prototype, 'clientHeight', 'get')
    .mockReturnValue(clientHeight);
  return {
    cleanup: () => {
      spy.mockRestore();
      delete (global as unknown as { ResizeObserver?: unknown }).ResizeObserver;
    },
  };
};

test('the tree is sized to the space the panel actually has', () => {
  const { cleanup } = withMeasuredHeight(300);
  try {
    renderTree();
    const holder = document.querySelector('.ant-tree-list-holder');
    expect(holder?.getAttribute('style')).toContain('max-height: 300px');
  } finally {
    cleanup();
  }
});

test('a collapsed panel measuring zero still renders rows', () => {
  const { cleanup } = withMeasuredHeight(0);
  try {
    renderTree();
    expect(screen.getByText('Project')).toBeInTheDocument();
  } finally {
    cleanup();
  }
});

test('the panel stacks above the other viewer overlays', () => {
  // Equal values would let the last-rendered "Matched" diagnostic win.
  renderTree();
  const wrap = screen.getByTestId('model-tree-wrap');
  expect(Number(getComputedStyle(wrap).zIndex)).toBeGreaterThan(10);
});

// Regression: push(...leaves) overflowed the argument limit on wide trees.
test('a wide tree past the argument limit renders and isolates', async () => {
  const LEAVES = 150000;
  // One node must hand its parent a single array of >125k leaf ids.
  const storey = {
    id: 'storey-0',
    name: 'Level 0',
    type: 'IfcBuildingStorey',
    children: Array.from({ length: LEAVES }, (_, i) => ({
      id: `obj-${i}`,
      name: `Beam ${i}`,
      type: 'IfcBeam',
      children: [],
    })),
  };
  const wideTree: TreeNode[] = [
    {
      id: 'building',
      name: 'Plant',
      type: 'IfcBuilding',
      children: [storey],
    },
  ];
  const visibility: Record<string, boolean> = {};
  for (let i = 0; i < LEAVES; i += 1) visibility[`obj-${i}`] = true;
  const api = {
    ...makeApi(),
    getVisibility: jest.fn().mockReturnValue(visibility),
  };

  render(<ModelTree tree={wideTree} api={api} open onClose={jest.fn()} />);
  expect(screen.getByText('Plant')).toBeInTheDocument();

  // Isolate resolves the subtree through the same leaf index that overflowed.
  await userEvent.click(screen.getByText('Plant'));
  await userEvent.click(screen.getByRole('button', { name: /isolate/i }));
  expect((api.isolate as jest.Mock).mock.calls[0][0]).toHaveLength(LEAVES);
});
