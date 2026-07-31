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
  render,
  screen,
  waitFor,
  fireEvent,
} from 'spec/helpers/testing-library';
import { DataMask } from '@superset-ui/core';
import BimChart from '../src/BimChart';
import * as viewerHook from '../src/useXeokitViewer';
import { BimChartProps } from '../src/types';
import { buildCrossFilterDataMask } from '../src/crossFilter';

const baseProps = (overrides: Partial<BimChartProps> = {}): BimChartProps => ({
  width: 800,
  height: 600,
  formData: {} as BimChartProps['formData'],
  modelUrl: '/fileuploader/api/files/abc/content',
  rows: [],
  overrides: [],
  colorFn: () => '#000',
  setDataMask: () => {},
  contextMode: 'faded',
  contextOpacity: 0.25,
  noDataColor: '#cccccc',
  highlightColor: '#00d9ff',
  showTree: true,
  showLegend: true,
  showMatched: true,
  ...overrides,
});

const colorize = jest.fn();
const setOpacity = jest.fn();
const setVisible = jest.fn();
const setHighlightColor = jest.fn();
const resetColors = jest.fn();
const expandToLeaves = jest.fn((id: string) =>
  id === 'storey' ? ['wall', 'door'] : [id],
);
const allObjectIds = jest.fn(() => ['storey', 'wall', 'door']);
const highlight = jest.fn();
// Captures the pick callback so tests can simulate a click by invoking it
// directly, mirroring how the real xeokit input handler would.
let capturedOnPick: ((gid: string | null) => void) | undefined;
const onPick = jest.fn((cb: (gid: string | null) => void) => {
  capturedOnPick = cb;
  return jest.fn();
});
const flyToDir = jest.fn();
// Captures the camera callback (and the unsubscribe) so tests can drive camera
// movement directly and assert the subscription is cleaned up.
let capturedOnCameraChange:
  | ((eye: number[], look: number[], up: number[]) => void)
  | undefined;
const unsubscribeCamera = jest.fn();
const onCameraChange = jest.fn(
  (cb: (eye: number[], look: number[], up: number[]) => void) => {
    capturedOnCameraChange = cb;
    return unsubscribeCamera;
  },
);

beforeEach(() => {
  colorize.mockClear();
  setOpacity.mockClear();
  setVisible.mockClear();
  setHighlightColor.mockClear();
  resetColors.mockClear();
  expandToLeaves.mockClear();
  allObjectIds.mockClear();
  highlight.mockClear();
  onPick.mockClear();
  capturedOnPick = undefined;
  flyToDir.mockClear();
  onCameraChange.mockClear();
  unsubscribeCamera.mockClear();
  capturedOnCameraChange = undefined;
});

test('shows a hint when there is no model URL', () => {
  jest.spyOn(viewerHook, 'default').mockReturnValue({ loading: false });
  render(<BimChart {...baseProps({ modelUrl: '' })} />);
  expect(screen.getByText(/model column/i)).toBeInTheDocument();
});

test('shows a spinner while loading', () => {
  jest.spyOn(viewerHook, 'default').mockReturnValue({ loading: true });
  render(<BimChart {...baseProps()} />);
  expect(screen.getByRole('status')).toBeInTheDocument();
});

test('shows an error alert with retry on failure', () => {
  jest
    .spyOn(viewerHook, 'default')
    .mockReturnValue({ loading: false, error: 'boom' });
  render(<BimChart {...baseProps()} />);
  expect(screen.getByRole('button', { name: /retry/i })).toBeInTheDocument();
});

test('3D container div is always present in DOM regardless of state', () => {
  // Verify container exists when modelUrl is empty
  jest.spyOn(viewerHook, 'default').mockReturnValue({ loading: false });
  const { rerender } = render(<BimChart {...baseProps({ modelUrl: '' })} />);
  expect(
    document.querySelector('[data-test="bim-container"]'),
  ).toBeInTheDocument();

  // Verify container still exists when hook returns an error
  jest
    .spyOn(viewerHook, 'default')
    .mockReturnValue({ loading: false, error: 'Connection failed' });
  rerender(<BimChart {...baseProps()} />);
  expect(
    document.querySelector('[data-test="bim-container"]'),
  ).toBeInTheDocument();
});

test('renders the model tree toggle once a model is present', () => {
  jest.spyOn(viewerHook, 'default').mockReturnValue({
    loading: false,
    tree: [{ id: 'a', name: 'A', type: 'IfcWall', children: [] }],
    api: {
      setVisible: jest.fn(),
      isolate: jest.fn(),
      showAll: jest.fn(),
      getVisibility: jest.fn().mockReturnValue({}),
      colorize: jest.fn(),
      setOpacity: jest.fn(),
      resetColors: jest.fn(),
      expandToLeaves: jest.fn(() => []),
      allObjectIds: jest.fn(() => []),
      onPick: jest.fn(() => () => {}),
      highlight: jest.fn(),
      setHighlightColor: jest.fn(),
      fit: jest.fn(),
      onCameraChange: jest.fn(() => () => {}),
      flyToDir: jest.fn(),
    },
  });
  render(<BimChart {...baseProps()} />);
  expect(screen.getByTestId('bim-tree-toggle')).toBeInTheDocument();
});

test('does not render the model tree when there is no model URL', () => {
  jest.spyOn(viewerHook, 'default').mockReturnValue({ loading: false });
  render(<BimChart {...baseProps({ modelUrl: '' })} />);
  expect(screen.queryByTestId('bim-tree-toggle')).not.toBeInTheDocument();
});

const paintingApi = {
  setVisible,
  isolate: jest.fn(),
  showAll: jest.fn(),
  getVisibility: jest.fn().mockReturnValue({}),
  colorize,
  setOpacity,
  resetColors,
  expandToLeaves,
  allObjectIds,
  onPick,
  highlight,
  setHighlightColor,
  fit: jest.fn(),
  onCameraChange,
  flyToDir,
};

test('paints neutral base then colored matches, in order', async () => {
  jest.spyOn(viewerHook, 'default').mockReturnValue({
    loading: false,
    tree: undefined,
    error: undefined,
    api: paintingApi,
    ready: true,
  });
  render(
    <BimChart
      {...baseProps({
        modelUrl: '/model',
        rows: [{ gid: 'wall', status: 'Done' }],
        linkColumn: 'gid',
        colorBy: 'status',
        colorFn: () => '#00ff00',
        overrides: [],
      })}
    />,
  );
  await waitFor(() => expect(colorize).toHaveBeenCalled());
  expect(resetColors).toHaveBeenCalled();
  // First colorize call is the neutral base over all objects.
  expect(colorize.mock.calls[0][0]).toEqual(['storey', 'wall', 'door']);
  // A later call paints the matched leaf(s) with the mapped rgb.
  expect(
    colorize.mock.calls.some(
      c => JSON.stringify(c[0]) === JSON.stringify(['wall']),
    ),
  ).toBe(true);
});

test('expands a container GlobalId to its leaves before painting', async () => {
  jest.spyOn(viewerHook, 'default').mockReturnValue({
    loading: false,
    tree: undefined,
    error: undefined,
    api: paintingApi,
    ready: true,
  });
  render(
    <BimChart
      {...baseProps({
        modelUrl: '/model',
        rows: [{ gid: 'storey', status: 'Done' }],
        linkColumn: 'gid',
        colorBy: 'status',
        colorFn: () => '#00ff00',
        overrides: [],
      })}
    />,
  );
  await waitFor(() => expect(expandToLeaves).toHaveBeenCalledWith('storey'));
});

test('shows a matched X of Y diagnostic, counted by data key', async () => {
  jest.spyOn(viewerHook, 'default').mockReturnValue({
    loading: false,
    tree: undefined,
    error: undefined,
    api: paintingApi,
    ready: true,
  });
  render(
    <BimChart
      {...baseProps({
        modelUrl: '/model',
        rows: [{ gid: 'wall', status: 'Done' }],
        linkColumn: 'gid',
        colorBy: 'status',
        colorFn: () => '#00ff00',
        overrides: [],
      })}
    />,
  );
  // One data key ('wall') maps to exactly one leaf, so m and n agree here;
  // the container case below is what distinguishes key-counting from
  // leaf-counting.
  await waitFor(() =>
    expect(screen.getByTestId('bim-diagnostic')).toHaveTextContent(
      'Matched 1 of 1',
    ),
  );
});

test('counts a container GlobalId as one matched key, not one per expanded leaf', async () => {
  // 'storey' is a single data key that expands to two geometry leaves
  // ('wall', 'door'). The diagnostic must report matched *data keys*
  // (1 of 1), not matched geometry leaves (which would read "2 of 1" and
  // violate m <= n).
  jest.spyOn(viewerHook, 'default').mockReturnValue({
    loading: false,
    tree: undefined,
    error: undefined,
    api: paintingApi,
    ready: true,
  });
  render(
    <BimChart
      {...baseProps({
        modelUrl: '/model',
        rows: [{ gid: 'storey', status: 'Done' }],
        linkColumn: 'gid',
        colorBy: 'status',
        colorFn: () => '#00ff00',
        overrides: [],
      })}
    />,
  );
  await waitFor(() =>
    expect(screen.getByTestId('bim-diagnostic')).toHaveTextContent(
      'Matched 1 of 1',
    ),
  );
  // Both leaves are still painted with the mapped color.
  expect(
    colorize.mock.calls.some(
      c => JSON.stringify(c[0]) === JSON.stringify(['wall', 'door']),
    ),
  ).toBe(true);
});

test('does not repaint on a re-render with the same data but new colorFn/overrides references', async () => {
  jest.spyOn(viewerHook, 'default').mockReturnValue({
    loading: false,
    tree: undefined,
    error: undefined,
    api: paintingApi,
    ready: true,
  });
  const rows = [{ gid: 'wall', status: 'Done' }];
  const { rerender } = render(
    <BimChart
      {...baseProps({
        modelUrl: '/model',
        rows,
        linkColumn: 'gid',
        colorBy: 'status',
        colorFn: () => '#00ff00',
        overrides: [],
      })}
    />,
  );
  await waitFor(() => expect(colorize).toHaveBeenCalled());
  const colorizeCallsAfterFirstPaint = colorize.mock.calls.length;
  const resetColorsCallsAfterFirstPaint = resetColors.mock.calls.length;

  // Same row content, but brand-new colorFn and overrides array references —
  // exactly what transformProps produces on every re-render even when the
  // underlying data is unchanged.
  rerender(
    <BimChart
      {...baseProps({
        modelUrl: '/model',
        rows,
        linkColumn: 'gid',
        colorBy: 'status',
        colorFn: () => '#00ff00',
        overrides: [],
      })}
    />,
  );

  // Give any (unwanted) effect a chance to run before asserting it didn't.
  await Promise.resolve();
  expect(colorize.mock.calls.length).toBe(colorizeCallsAfterFirstPaint);
  expect(resetColors.mock.calls.length).toBe(resetColorsCallsAfterFirstPaint);
});

test('repaints on a re-render with the same data but a different colorScheme', async () => {
  jest.spyOn(viewerHook, 'default').mockReturnValue({
    loading: false,
    tree: undefined,
    error: undefined,
    api: paintingApi,
    ready: true,
  });
  const rows = [{ gid: 'wall', status: 'Done' }];
  const { rerender } = render(
    <BimChart
      {...baseProps({
        modelUrl: '/model',
        rows,
        linkColumn: 'gid',
        colorBy: 'status',
        colorFn: () => '#00ff00',
        overrides: [],
        colorScheme: 'supersetColors',
      })}
    />,
  );
  await waitFor(() => expect(colorize).toHaveBeenCalled());
  const colorizeCallsAfterFirstPaint = colorize.mock.calls.length;

  // Same rows/linkColumn/colorBy/overrides, but a different dashboard-level
  // color scheme — this is what a colorFn returning different colors for the
  // same value looks like from the chart's perspective. The mapping must be
  // recomputed and the model repainted, not left stale.
  rerender(
    <BimChart
      {...baseProps({
        modelUrl: '/model',
        rows,
        linkColumn: 'gid',
        colorBy: 'status',
        colorFn: () => '#ff00ff',
        overrides: [],
        colorScheme: 'googleCategory10c',
      })}
    />,
  );

  await waitFor(() =>
    expect(colorize.mock.calls.length).toBeGreaterThan(
      colorizeCallsAfterFirstPaint,
    ),
  );
});

test('does not paint while api is present but the scene is not ready, then paints once ready', async () => {
  // Reproduces the live bug: useXeokitViewer sets state with `api` twice for
  // the same load — once right after loader.load() (scene still empty) and
  // once inside the 'loaded' handler (scene populated) alongside `ready`.
  // The mock below models both moments explicitly via `ready`.
  const mockUseXeokitViewer = jest.spyOn(viewerHook, 'default');
  mockUseXeokitViewer.mockReturnValue({
    loading: false,
    tree: undefined,
    error: undefined,
    api: paintingApi,
    ready: false,
  });
  const rows = [{ gid: 'wall', status: 'Done' }];
  const { rerender } = render(
    <BimChart
      {...baseProps({
        modelUrl: '/model',
        rows,
        linkColumn: 'gid',
        colorBy: 'status',
        colorFn: () => '#00ff00',
        overrides: [],
      })}
    />,
  );

  // Give the paint effect a chance to run before asserting it did not.
  await Promise.resolve();
  expect(resetColors).not.toHaveBeenCalled();
  expect(colorize).not.toHaveBeenCalled();
  expect(screen.queryByTestId('bim-diagnostic')).not.toBeInTheDocument();

  // Same api reference, same colorById-driving props — only `ready` flips.
  // This is exactly what happens when the 'loaded' event fires: the hook's
  // second setState carries the identical `api` closure plus ready: true.
  mockUseXeokitViewer.mockReturnValue({
    loading: false,
    tree: undefined,
    error: undefined,
    api: paintingApi,
    ready: true,
  });
  rerender(
    <BimChart
      {...baseProps({
        modelUrl: '/model',
        rows,
        linkColumn: 'gid',
        colorBy: 'status',
        colorFn: () => '#00ff00',
        overrides: [],
      })}
    />,
  );

  await waitFor(() => expect(colorize).toHaveBeenCalled());
  expect(resetColors).toHaveBeenCalled();
  expect(colorize.mock.calls[0][0]).toEqual(['storey', 'wall', 'door']);
  await waitFor(() =>
    expect(screen.getByTestId('bim-diagnostic')).toHaveTextContent(
      'Matched 1 of 1',
    ),
  );
});

test('no legend and no painting when colorBy is absent', async () => {
  jest.spyOn(viewerHook, 'default').mockReturnValue({
    loading: false,
    tree: undefined,
    error: undefined,
    api: paintingApi,
    ready: true,
  });
  render(
    <BimChart
      {...baseProps({
        modelUrl: '/model',
        rows: [],
        overrides: [],
        colorFn: () => '#000',
      })}
    />,
  );
  await waitFor(() => expect(screen.queryByTestId('bim-legend')).toBeNull());
  expect(colorize).not.toHaveBeenCalled();
});

// --- Click -> cross-filter and filterState -> highlight ---

test('clicking an element emits a cross-filter when enabled', () => {
  jest.spyOn(viewerHook, 'default').mockReturnValue({
    loading: false,
    api: paintingApi,
    ready: true,
  });
  const setDataMask = jest.fn();
  render(
    <BimChart
      {...baseProps({
        modelUrl: '/model',
        linkColumn: 'gid',
        emitCrossFilters: true,
        setDataMask,
      })}
    />,
  );
  expect(capturedOnPick).toBeDefined();
  capturedOnPick?.('gid-1');
  expect(setDataMask).toHaveBeenCalledWith(
    buildCrossFilterDataMask('gid', 'gid-1'),
  );
});

test('clicking does not emit when cross-filtering is disabled', () => {
  jest.spyOn(viewerHook, 'default').mockReturnValue({
    loading: false,
    api: paintingApi,
    ready: true,
  });
  const setDataMask = jest.fn();
  render(
    <BimChart
      {...baseProps({
        modelUrl: '/model',
        linkColumn: 'gid',
        emitCrossFilters: false,
        setDataMask,
      })}
    />,
  );
  expect(capturedOnPick).toBeDefined();
  capturedOnPick?.('gid-1');
  expect(setDataMask).not.toHaveBeenCalled();
  // Disabled mode highlights locally instead of emitting a filter.
  expect(highlight).toHaveBeenCalledWith(['gid-1']);
});

test('clicking the same element twice clears the filter', () => {
  jest.spyOn(viewerHook, 'default').mockReturnValue({
    loading: false,
    api: paintingApi,
    ready: true,
  });
  const setDataMask = jest.fn();
  render(
    <BimChart
      {...baseProps({
        modelUrl: '/model',
        linkColumn: 'gid',
        emitCrossFilters: true,
        setDataMask,
      })}
    />,
  );
  capturedOnPick?.('gid-1');
  capturedOnPick?.('gid-1');
  const calls = setDataMask.mock.calls as [DataMask][];
  expect(calls[calls.length - 1][0]).toEqual(
    buildCrossFilterDataMask('gid', null),
  );
});

test('clicking empty space clears the filter', () => {
  jest.spyOn(viewerHook, 'default').mockReturnValue({
    loading: false,
    api: paintingApi,
    ready: true,
  });
  const setDataMask = jest.fn();
  render(
    <BimChart
      {...baseProps({
        modelUrl: '/model',
        linkColumn: 'gid',
        emitCrossFilters: true,
        setDataMask,
      })}
    />,
  );
  capturedOnPick?.(null);
  expect(setDataMask).toHaveBeenCalledWith(
    buildCrossFilterDataMask('gid', null),
  );
});

test('filterState drives highlight when cross-filtering is enabled', () => {
  jest.spyOn(viewerHook, 'default').mockReturnValue({
    loading: false,
    api: paintingApi,
    ready: true,
  });
  render(
    <BimChart
      {...baseProps({
        modelUrl: '/model',
        linkColumn: 'gid',
        emitCrossFilters: true,
        filterState: { value: ['gid-1'] },
      })}
    />,
  );
  expect(highlight).toHaveBeenCalledWith(['gid-1']);
});

test('does not highlight until the scene is ready', () => {
  const mockUseXeokitViewer = jest.spyOn(viewerHook, 'default');
  mockUseXeokitViewer.mockReturnValue({
    loading: false,
    api: paintingApi,
    ready: false,
  });
  const { rerender } = render(
    <BimChart
      {...baseProps({
        modelUrl: '/model',
        linkColumn: 'gid',
        emitCrossFilters: true,
        filterState: { value: ['gid-1'] },
      })}
    />,
  );
  expect(highlight).not.toHaveBeenCalled();

  mockUseXeokitViewer.mockReturnValue({
    loading: false,
    api: paintingApi,
    ready: true,
  });
  rerender(
    <BimChart
      {...baseProps({
        modelUrl: '/model',
        linkColumn: 'gid',
        emitCrossFilters: true,
        filterState: { value: ['gid-1'] },
      })}
    />,
  );
  expect(highlight).toHaveBeenCalledWith(['gid-1']);
});

test('shows the updating badge while re-fetching (model mounted, rows empty)', () => {
  jest.spyOn(viewerHook, 'default').mockReturnValue({
    loading: false,
    error: undefined,
    api: paintingApi,
    ready: true,
  });
  render(
    <BimChart
      {...baseProps({
        modelUrl: '/model',
        rows: [],
        linkColumn: 'gid',
        colorBy: 'status',
      })}
    />,
  );
  expect(screen.getByTestId('bim-refreshing')).toBeInTheDocument();
});

test('hides the updating badge once data is present', () => {
  jest.spyOn(viewerHook, 'default').mockReturnValue({
    loading: false,
    error: undefined,
    api: paintingApi,
    ready: true,
  });
  render(
    <BimChart
      {...baseProps({
        modelUrl: '/model',
        rows: [{ gid: 'wall', status: 'Done' }],
        linkColumn: 'gid',
        colorBy: 'status',
      })}
    />,
  );
  expect(screen.queryByTestId('bim-refreshing')).not.toBeInTheDocument();
});

test('hidden context mode hides no-data elements and shows matched ones', async () => {
  jest.spyOn(viewerHook, 'default').mockReturnValue({
    loading: false,
    api: paintingApi,
    ready: true,
  });
  render(
    <BimChart
      {...baseProps({
        modelUrl: '/model',
        rows: [{ gid: 'wall', status: 'Done' }],
        linkColumn: 'gid',
        colorBy: 'status',
        contextMode: 'hidden',
      })}
    />,
  );
  // All hidden first, then matched leaves made visible again.
  await waitFor(() =>
    expect(setVisible).toHaveBeenCalledWith(['storey', 'wall', 'door'], false),
  );
  expect(
    setVisible.mock.calls.some(
      c => JSON.stringify(c[0]) === JSON.stringify(['wall']) && c[1] === true,
    ),
  ).toBe(true);
});

test('faded context mode fades no-data elements with the given opacity', async () => {
  jest.spyOn(viewerHook, 'default').mockReturnValue({
    loading: false,
    api: paintingApi,
    ready: true,
  });
  render(
    <BimChart
      {...baseProps({
        modelUrl: '/model',
        rows: [{ gid: 'wall', status: 'Done' }],
        linkColumn: 'gid',
        colorBy: 'status',
        contextMode: 'faded',
        contextOpacity: 0.3,
      })}
    />,
  );
  await waitFor(() =>
    expect(setOpacity).toHaveBeenCalledWith(['storey', 'wall', 'door'], 0.3),
  );
});

test('opaque context mode keeps no-data elements fully opaque', async () => {
  jest.spyOn(viewerHook, 'default').mockReturnValue({
    loading: false,
    api: paintingApi,
    ready: true,
  });
  render(
    <BimChart
      {...baseProps({
        modelUrl: '/model',
        rows: [{ gid: 'wall', status: 'Done' }],
        linkColumn: 'gid',
        colorBy: 'status',
        contextMode: 'opaque',
      })}
    />,
  );
  await waitFor(() =>
    expect(setOpacity).toHaveBeenCalledWith(['storey', 'wall', 'door'], 1),
  );
});

test('applies the highlight color from the control', () => {
  jest.spyOn(viewerHook, 'default').mockReturnValue({
    loading: false,
    api: paintingApi,
    ready: true,
  });
  render(
    <BimChart
      {...baseProps({ modelUrl: '/model', highlightColor: '#ff8800' })}
    />,
  );
  expect(setHighlightColor).toHaveBeenCalledWith('#ff8800');
});

test('hides the model tree when show_tree is false', () => {
  jest.spyOn(viewerHook, 'default').mockReturnValue({
    loading: false,
    tree: [{ id: 'a', name: 'A', type: 'IfcWall', children: [] }],
    api: paintingApi,
    ready: true,
  });
  render(<BimChart {...baseProps({ modelUrl: '/model', showTree: false })} />);
  expect(screen.queryByTestId('bim-tree-toggle')).not.toBeInTheDocument();
});

test('hides the matched diagnostic when show_matched is false', async () => {
  jest.spyOn(viewerHook, 'default').mockReturnValue({
    loading: false,
    api: paintingApi,
    ready: true,
  });
  render(
    <BimChart
      {...baseProps({
        modelUrl: '/model',
        rows: [{ gid: 'wall', status: 'Done' }],
        linkColumn: 'gid',
        colorBy: 'status',
        showMatched: false,
      })}
    />,
  );
  await waitFor(() => expect(colorize).toHaveBeenCalled());
  expect(screen.queryByTestId('bim-diagnostic')).not.toBeInTheDocument();
});

test('renders the orientation cube once a model is loaded', () => {
  jest
    .spyOn(viewerHook, 'default')
    .mockReturnValue({ loading: false, api: paintingApi, ready: true });
  render(<BimChart {...baseProps({ modelUrl: '/model' })} />);
  expect(screen.getByTestId('bim-navcube')).toBeInTheDocument();
});

test('does not render the orientation cube without a model', () => {
  jest.spyOn(viewerHook, 'default').mockReturnValue({ loading: false });
  render(<BimChart {...baseProps({ modelUrl: '' })} />);
  expect(screen.queryByTestId('bim-navcube')).not.toBeInTheDocument();
});

test('clicking a cube face flies the camera to that view', () => {
  jest
    .spyOn(viewerHook, 'default')
    .mockReturnValue({ loading: false, api: paintingApi, ready: true });
  render(<BimChart {...baseProps({ modelUrl: '/model' })} />);

  fireEvent.click(screen.getByTestId('bim-navcube-face-top'));

  // Top view: camera above the model, looking down, with -Z up (a +Y up vector
  // would be parallel to the view direction).
  expect(flyToDir).toHaveBeenCalledWith([0, 1, 0], [0, 0, -1]);
});

test('clicking a cube corner flies to the isometric view', () => {
  jest
    .spyOn(viewerHook, 'default')
    .mockReturnValue({ loading: false, api: paintingApi, ready: true });
  render(<BimChart {...baseProps({ modelUrl: '/model' })} />);

  fireEvent.click(screen.getByTestId('bim-navcube-corner-top-front-right'));

  const [dir, up] = flyToDir.mock.calls[0];
  expect(dir.every((v: number) => v > 0)).toBe(true);
  expect(Math.hypot(...dir)).toBeCloseTo(1);
  expect(up).toEqual([0, 1, 0]);
});

test('camera movement rotates the cube', () => {
  jest
    .spyOn(viewerHook, 'default')
    .mockReturnValue({ loading: false, api: paintingApi, ready: true });
  render(<BimChart {...baseProps({ modelUrl: '/model' })} />);

  expect(onCameraChange).toHaveBeenCalled();
  // Camera directly above the model tips the cube to show its top face.
  capturedOnCameraChange!([0, 10, 0], [0, 0, 0], [0, 0, -1]);

  const cube = screen.getByTestId('bim-navcube-cube');
  expect(cube.style.transform).toMatch(/rotateX\(90/);
});

test('does not subscribe to the camera before the scene is ready', () => {
  // `api` is a stable reference handed out before the scene is populated;
  // subscribing then would read an empty scene (the timing bug that made
  // data-driven colouring paint nothing).
  jest
    .spyOn(viewerHook, 'default')
    .mockReturnValue({ loading: false, api: paintingApi, ready: false });
  render(<BimChart {...baseProps({ modelUrl: '/model' })} />);
  expect(onCameraChange).not.toHaveBeenCalled();
});

test('unsubscribes from the camera on unmount', () => {
  jest
    .spyOn(viewerHook, 'default')
    .mockReturnValue({ loading: false, api: paintingApi, ready: true });
  const { unmount } = render(
    <BimChart {...baseProps({ modelUrl: '/model' })} />,
  );

  expect(onCameraChange).toHaveBeenCalled();
  unmount();
  expect(unsubscribeCamera).toHaveBeenCalled();
});

test('clicking a legend entry dims that category in the scene', async () => {
  jest
    .spyOn(viewerHook, 'default')
    .mockReturnValue({ loading: false, api: paintingApi, ready: true });
  render(
    <BimChart
      {...baseProps({
        modelUrl: '/model',
        rows: [
          { gid: 'wall', status: 'Done' },
          { gid: 'door', status: 'Late' },
        ],
        linkColumn: 'gid',
        colorBy: 'status',
        contextOpacity: 0.25,
      })}
    />,
  );
  await waitFor(() => expect(colorize).toHaveBeenCalled());
  setOpacity.mockClear();

  fireEvent.click(screen.getByTestId('bim-legend-item-Done'));

  await waitFor(() =>
    expect(
      setOpacity.mock.calls.some(
        ([ids, opacity]) =>
          JSON.stringify(ids) === JSON.stringify(['wall']) && opacity === 0.25,
      ),
    ).toBe(true),
  );
  // Visual only: the tree stays the sole owner of visibility.
  expect(setVisible).not.toHaveBeenCalled();
});

test('dimming a category emits no cross-filter', async () => {
  const setDataMask = jest.fn();
  jest
    .spyOn(viewerHook, 'default')
    .mockReturnValue({ loading: false, api: paintingApi, ready: true });
  render(
    <BimChart
      {...baseProps({
        modelUrl: '/model',
        rows: [{ gid: 'wall', status: 'Done' }],
        linkColumn: 'gid',
        colorBy: 'status',
        emitCrossFilters: true,
        setDataMask,
      })}
    />,
  );
  await waitFor(() => expect(colorize).toHaveBeenCalled());

  fireEvent.click(screen.getByTestId('bim-legend-item-Done'));

  expect(setDataMask).not.toHaveBeenCalled();
});
