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
import { render, screen } from 'spec/helpers/testing-library';
import BimChart from '../src/BimChart';
import * as viewerHook from '../src/useXeokitViewer';
import { BimChartProps } from '../src/types';

const baseProps = (overrides: Partial<BimChartProps> = {}): BimChartProps => ({
  width: 800,
  height: 600,
  formData: {} as BimChartProps['formData'],
  modelUrl: '/fileuploader/api/files/abc/content',
  ...overrides,
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
  expect(document.querySelector('[data-test="bim-container"]')).toBeInTheDocument();

  // Verify container still exists when hook returns an error
  jest
    .spyOn(viewerHook, 'default')
    .mockReturnValue({ loading: false, error: 'Connection failed' });
  rerender(<BimChart {...baseProps()} />);
  expect(document.querySelector('[data-test="bim-container"]')).toBeInTheDocument();
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
