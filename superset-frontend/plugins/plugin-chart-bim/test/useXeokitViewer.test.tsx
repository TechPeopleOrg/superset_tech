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
import { useRef } from 'react';
import { render, waitFor } from '@testing-library/react';
import useXeokitViewer from '../src/useXeokitViewer';

// Prefixed with "mock" so babel-jest hoisting allows referencing them inside
// the jest.mock() factory (variables not prefixed with mock are forbidden).
const mockLoad = jest.fn();
const mockDestroyModel = jest.fn();
const mockDestroyViewer = jest.fn();

jest.mock('@xeokit/xeokit-sdk', () => ({
  Viewer: jest.fn().mockImplementation(() => ({
    scene: { canvas: {}, clearLights: jest.fn(), aabb: [0, 0, 0, 1, 1, 1] },
    camera: {},
    cameraFlight: { flyTo: jest.fn() },
    cameraControl: {},
    destroy: mockDestroyViewer,
  })),
  XKTLoaderPlugin: jest.fn().mockImplementation(() => ({
    load: (...args: unknown[]) => {
      mockLoad(...args);
      return { destroy: mockDestroyModel, on: jest.fn() };
    },
  })),
}));

function Harness({ url }: { url: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const state = useXeokitViewer(ref, { modelUrl: url });
  return (
    <div>
      <div ref={ref} data-test="canvas" />
      <span data-test="loading">{String(state.loading)}</span>
      <span data-test="error">{state.error ?? ''}</span>
    </div>
  );
}

test('loads the model URL through XKTLoaderPlugin', async () => {
  render(<Harness url="/fileuploader/api/files/abc/content" />);
  await waitFor(() => expect(mockLoad).toHaveBeenCalled());
  const args = mockLoad.mock.calls[0][0] as { src: string };
  expect(args.src).toBe('/fileuploader/api/files/abc/content');
});

test('does nothing when modelUrl is empty', async () => {
  mockLoad.mockClear();
  render(<Harness url="" />);
  await waitFor(() => {}, { timeout: 50 }).catch(() => {});
  expect(mockLoad).not.toHaveBeenCalled();
});

test('destroys the viewer on unmount', async () => {
  mockDestroyViewer.mockClear();
  const { unmount } = render(
    <Harness url="/fileuploader/api/files/abc/content" />,
  );
  await waitFor(() => expect(mockLoad).toHaveBeenCalled());
  unmount();
  await waitFor(() => expect(mockDestroyViewer).toHaveBeenCalled());
});
