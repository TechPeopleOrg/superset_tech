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
import { render, screen, waitFor } from 'spec/helpers/testing-library';
import BimChart from '../src/BimChart';
import * as viewerHook from '../src/useXeokitViewer';
import { BimChartProps } from '../src/types';

const baseProps = (overrides: Partial<BimChartProps> = {}): BimChartProps => ({
  width: 800,
  height: 600,
  formData: {} as BimChartProps['formData'],
  modelUrl: '/fileuploader/api/files/abc/content',
  rows: [],
  overrides: [],
  colorFn: () => '#000',
  ...overrides,
});

const colorize = jest.fn();
const resetColors = jest.fn();
const expandToLeaves = jest.fn((id: string) =>
  id === 'storey' ? ['wall', 'door'] : [id],
);
const allObjectIds = jest.fn(() => ['storey', 'wall', 'door']);

beforeEach(() => {
  colorize.mockClear();
  resetColors.mockClear();
  expandToLeaves.mockClear();
  allObjectIds.mockClear();
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
      resetColors: jest.fn(),
      expandToLeaves: jest.fn(() => []),
      allObjectIds: jest.fn(() => []),
    },
  });
  render(<BimChart {...baseProps()} />);
  expect(screen.getByTestId('model-tree-toggle')).toBeInTheDocument();
});

test('does not render the model tree when there is no model URL', () => {
  jest.spyOn(viewerHook, 'default').mockReturnValue({ loading: false });
  render(<BimChart {...baseProps({ modelUrl: '' })} />);
  expect(screen.queryByTestId('model-tree-toggle')).not.toBeInTheDocument();
});

const paintingApi = {
  setVisible: jest.fn(),
  isolate: jest.fn(),
  showAll: jest.fn(),
  getVisibility: jest.fn().mockReturnValue({}),
  colorize,
  resetColors,
  expandToLeaves,
  allObjectIds,
};

test('paints neutral base then colored matches, in order', async () => {
  jest.spyOn(viewerHook, 'default').mockReturnValue({
    loading: false,
    tree: undefined,
    error: undefined,
    api: paintingApi,
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

test('shows a matched X of Y diagnostic', async () => {
  jest.spyOn(viewerHook, 'default').mockReturnValue({
    loading: false,
    tree: undefined,
    error: undefined,
    api: paintingApi,
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
  await waitFor(() =>
    expect(screen.getByTestId('bim-diagnostic')).toHaveTextContent('1'),
  );
});

test('does not repaint on a re-render with the same data but new colorFn/overrides references', async () => {
  jest.spyOn(viewerHook, 'default').mockReturnValue({
    loading: false,
    tree: undefined,
    error: undefined,
    api: paintingApi,
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

test('no legend and no painting when colorBy is absent', async () => {
  jest.spyOn(viewerHook, 'default').mockReturnValue({
    loading: false,
    tree: undefined,
    error: undefined,
    api: paintingApi,
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
