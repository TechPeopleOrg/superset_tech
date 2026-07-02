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
import { createRef } from 'react';
import { renderHook, waitFor, act } from '@testing-library/react';
import useXeokitViewer from '../src/useXeokitViewer';

// Captures the 'loaded' callback so the test can fire it deterministically.
let loadedCb: (() => void) | undefined;

const objects: Record<string, { visible: boolean }> = {
  wall: { visible: true },
  door: { visible: true },
};

const metaObjects = {
  proj: { id: 'proj', name: 'Project', type: 'IfcProject' },
  wall: { id: 'wall', name: 'Wall', type: 'IfcWall', parent: { id: 'proj' } },
  door: { id: 'door', name: 'Door', type: 'IfcDoor', parent: { id: 'proj' } },
};

jest.mock('@xeokit/xeokit-sdk', () => ({
  Viewer: jest.fn().mockImplementation(() => ({
    scene: { objects, aabb: [0, 0, 0, 1, 1, 1] },
    metaScene: { metaObjects },
    camera: { eye: [0, 0, 0], look: [0, 0, 0], up: [0, 1, 0] },
    cameraControl: {},
    cameraFlight: { flyTo: jest.fn() },
    destroy: jest.fn(),
  })),
  XKTLoaderPlugin: jest.fn().mockImplementation(() => ({
    load: jest.fn().mockImplementation(() => ({
      on: (event: string, cb: () => void) => {
        if (event === 'loaded') loadedCb = cb;
      },
      destroy: jest.fn(),
    })),
  })),
}));

beforeEach(() => {
  loadedCb = undefined;
  objects.wall.visible = true;
  objects.door.visible = true;
});

const renderViewer = () => {
  const ref = createRef<HTMLDivElement>();
  // The hook needs a real element to attach the canvas to.
  (ref as { current: HTMLDivElement }).current = document.createElement('div');
  return renderHook(() =>
    useXeokitViewer(ref, { modelUrl: '/model' }),
  );
};

test('exposes a containment tree once the model loads', async () => {
  const { result } = renderViewer();
  await waitFor(() => expect(loadedCb).toBeDefined());
  act(() => loadedCb!());
  await waitFor(() => expect(result.current.tree).toBeDefined());
  expect(result.current.tree).toEqual([
    {
      id: 'proj',
      name: 'Project',
      type: 'IfcProject',
      children: [
        { id: 'wall', name: 'Wall', type: 'IfcWall', children: [] },
        { id: 'door', name: 'Door', type: 'IfcDoor', children: [] },
      ],
    },
  ]);
});

test('api.setVisible toggles entity visibility', async () => {
  const { result } = renderViewer();
  await waitFor(() => expect(result.current.api).toBeDefined());
  act(() => result.current.api!.setVisible(['wall'], false));
  expect(objects.wall.visible).toBe(false);
  expect(objects.door.visible).toBe(true);
});

test('api.isolate shows only the given objects', async () => {
  const { result } = renderViewer();
  await waitFor(() => expect(result.current.api).toBeDefined());
  act(() => result.current.api!.isolate(['door']));
  expect(objects.wall.visible).toBe(false);
  expect(objects.door.visible).toBe(true);
});

test('api.showAll makes everything visible', async () => {
  const { result } = renderViewer();
  await waitFor(() => expect(result.current.api).toBeDefined());
  act(() => result.current.api!.setVisible(['wall'], false));
  act(() => result.current.api!.showAll());
  expect(result.current.api!.getVisibility()).toEqual({
    wall: true,
    door: true,
  });
});

test('tree and api reset to undefined when modelUrl changes', async () => {
  const ref = createRef<HTMLDivElement>();
  (ref as { current: HTMLDivElement }).current = document.createElement('div');

  const { result, rerender } = renderHook(
    ({ url }: { url: string }) =>
      useXeokitViewer(ref, { modelUrl: url }),
    { initialProps: { url: '/model-a' } },
  );

  // Wait for first load to register the 'loaded' callback, then fire it.
  await waitFor(() => expect(loadedCb).toBeDefined());
  act(() => loadedCb!());
  await waitFor(() => expect(result.current.tree).toBeDefined());
  await waitFor(() => expect(result.current.api).toBeDefined());

  // Change modelUrl — cleanup runs, state resets to { loading: true }.
  loadedCb = undefined;
  rerender({ url: '/model-b' });

  // Before the new 'loaded' event fires, tree must be undefined (reset by
  // the effect initialisation). This assertion fails if cleanup omits the
  // state reset on re-mount.
  await waitFor(() => expect(result.current.tree).toBeUndefined());

  // After the new 'loaded' fires, tree is populated again.
  await waitFor(() => expect(loadedCb).toBeDefined());
  act(() => loadedCb!());
  await waitFor(() => expect(result.current.tree).toBeDefined());
});
