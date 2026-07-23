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

const objects: Record<
  string,
  { visible: boolean; colorize: number[]; highlighted: boolean }
> = {
  storey: { visible: true, colorize: [1, 1, 1], highlighted: false },
  wall: { visible: true, colorize: [1, 1, 1], highlighted: false },
  door: { visible: true, colorize: [1, 1, 1], highlighted: false },
};

const metaObjects = {
  proj: { id: 'proj', name: 'Project', type: 'IfcProject' },
  wall: { id: 'wall', name: 'Wall', type: 'IfcWall', parent: { id: 'proj' } },
  door: { id: 'door', name: 'Door', type: 'IfcDoor', parent: { id: 'proj' } },
};

// Records 'mouseclicked' handlers registered via scene.input.on so tests can
// invoke them deterministically, mirroring xeokit's subscription-id API.
const mockPickHandlers: Array<(coords: unknown) => void> = [];
const mockScenePick = jest.fn();
const mockSceneInput = {
  on: (event: string, cb: (coords: unknown) => void) => {
    if (event === 'mouseclicked') mockPickHandlers.push(cb);
    return mockPickHandlers.length - 1;
  },
  off: (id: number) => {
    mockPickHandlers[id] = () => {};
  },
};

// Holds the scene object of the most recently created Viewer so tests can
// simulate xeokit nulling scene.input on destroy (see the unsubscribe-after-
// destroy test). Prefixed `mock` so jest.mock's factory may reference it.
const mockSceneHolder: { scene?: { input: unknown } } = {};

jest.mock('@xeokit/xeokit-sdk', () => {
  const scene = {
    objects,
    aabb: [0, 0, 0, 1, 1, 1],
    input: mockSceneInput as unknown,
    pick: mockScenePick,
    highlightMaterial: {
      fill: true,
      fillColor: [0, 0, 0],
      fillAlpha: 0,
      edges: true,
      edgeColor: [0, 0, 0],
      edgeAlpha: 0,
      glowThrough: true,
    },
  };
  mockSceneHolder.scene = scene;
  return {
    Viewer: jest.fn().mockImplementation(() => ({
      scene,
      metaScene: {
        metaObjects,
        // storey contains wall+door plus 'pset1', a property set with no
        // geometry entity in scene.objects — exercises the
        // `.filter(oid => !!scene.objects[oid])` non-geometry filtering in
        // expandToLeaves. Leaves return themselves.
        getObjectIDsInSubtree: (id: string) =>
          id === 'storey' ? ['storey', 'wall', 'door', 'pset1'] : [id],
      },
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
  };
});

beforeEach(() => {
  loadedCb = undefined;
  objects.storey.visible = true;
  objects.wall.visible = true;
  objects.door.visible = true;
  objects.storey.colorize = [1, 1, 1];
  objects.wall.colorize = [1, 1, 1];
  objects.door.colorize = [1, 1, 1];
  objects.storey.highlighted = false;
  objects.wall.highlighted = false;
  objects.door.highlighted = false;
  mockPickHandlers.length = 0;
  mockScenePick.mockReset();
  // Restore scene.input in case a prior test simulated destroy by nulling it.
  if (mockSceneHolder.scene) mockSceneHolder.scene.input = mockSceneInput;
});

const renderViewer = () => {
  const ref = createRef<HTMLDivElement>();
  // The hook needs a real element to attach the canvas to.
  (ref as { current: HTMLDivElement }).current = document.createElement('div');
  return renderHook(() => useXeokitViewer(ref, { modelUrl: '/model' }));
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
    storey: true,
    wall: true,
    door: true,
  });
});

test('tree and api reset to undefined when modelUrl changes', async () => {
  const ref = createRef<HTMLDivElement>();
  (ref as { current: HTMLDivElement }).current = document.createElement('div');

  const { result, rerender } = renderHook(
    ({ url }: { url: string }) => useXeokitViewer(ref, { modelUrl: url }),
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

test('api.colorize sets colorize only on existing objects', async () => {
  const { result } = renderViewer();
  await waitFor(() => expect(result.current.api).toBeDefined());
  act(() => result.current.api!.colorize(['wall', 'ghost'], [1, 0, 0]));
  expect(objects.wall.colorize).toEqual([1, 0, 0]);
  expect(objects.door.colorize).toEqual([1, 1, 1]);
});

test('api.resetColors with no args resets all objects', async () => {
  const { result } = renderViewer();
  await waitFor(() => expect(result.current.api).toBeDefined());
  act(() => result.current.api!.colorize(['wall', 'door'], [1, 0, 0]));
  act(() => result.current.api!.resetColors());
  expect(objects.wall.colorize).toEqual([1, 1, 1]);
  expect(objects.door.colorize).toEqual([1, 1, 1]);
});

test('api.resetColors with ids resets only those', async () => {
  const { result } = renderViewer();
  await waitFor(() => expect(result.current.api).toBeDefined());
  act(() => result.current.api!.colorize(['wall', 'door'], [1, 0, 0]));
  act(() => result.current.api!.resetColors(['wall']));
  expect(objects.wall.colorize).toEqual([1, 1, 1]);
  expect(objects.door.colorize).toEqual([1, 0, 0]);
});

test('api.expandToLeaves returns geometry leaves under a container', async () => {
  const { result } = renderViewer();
  await waitFor(() => expect(result.current.api).toBeDefined());
  const leaves = result.current.api!.expandToLeaves('storey');
  // Must contain exactly the geometry leaves and must not contain 'pset1',
  // which has no entry in scene.objects (a property set, not geometry).
  expect(leaves.sort()).toEqual(['door', 'storey', 'wall']);
  expect(leaves).not.toContain('pset1');
  expect(result.current.api!.expandToLeaves('wall')).toEqual(['wall']);
});

test('api.allObjectIds returns every scene object id', async () => {
  const { result } = renderViewer();
  await waitFor(() => expect(result.current.api).toBeDefined());
  expect(result.current.api!.allObjectIds().sort()).toEqual([
    'door',
    'storey',
    'wall',
  ]);
});

test('api.onPick fires the callback with the picked entity id', async () => {
  const { result } = renderViewer();
  await waitFor(() => expect(result.current.api).toBeDefined());
  mockScenePick.mockReturnValue({ entity: { id: 'gid-1' } });
  const cb = jest.fn();
  act(() => {
    result.current.api!.onPick(cb);
  });
  act(() => mockPickHandlers[0]({ x: 1, y: 2 }));
  expect(cb).toHaveBeenCalledWith('gid-1');
});

test('api.onPick fires the callback with null when the click hits nothing', async () => {
  const { result } = renderViewer();
  await waitFor(() => expect(result.current.api).toBeDefined());
  mockScenePick.mockReturnValue(undefined);
  const cb = jest.fn();
  act(() => {
    result.current.api!.onPick(cb);
  });
  act(() => mockPickHandlers[0]({ x: 1, y: 2 }));
  expect(cb).toHaveBeenCalledWith(null);
});

test('api.onPick returns an unsubscribe that removes the listener', async () => {
  const { result } = renderViewer();
  await waitFor(() => expect(result.current.api).toBeDefined());
  mockScenePick.mockReturnValue({ entity: { id: 'gid-1' } });
  const cb = jest.fn();
  let unsubscribe: () => void = () => {};
  act(() => {
    unsubscribe = result.current.api!.onPick(cb);
  });
  act(() => unsubscribe());
  act(() => mockPickHandlers[0]({ x: 1, y: 2 }));
  expect(cb).not.toHaveBeenCalled();
});

test('unsubscribe after the scene is destroyed does not throw', async () => {
  const { result } = renderViewer();
  await waitFor(() => expect(result.current.api).toBeDefined());
  let unsubscribe: () => void = () => {};
  act(() => {
    unsubscribe = result.current.api!.onPick(jest.fn());
  });
  // xeokit nulls scene.input inside viewer.destroy(); a consumer's cleanup can
  // still fire afterwards. The unsubscribe must tolerate the dead scene.
  mockSceneHolder.scene!.input = null;
  expect(() => unsubscribe()).not.toThrow();
});

test('api.highlight sets highlighted on leaves and clears previous highlight', async () => {
  const { result } = renderViewer();
  await waitFor(() => expect(result.current.api).toBeDefined());
  act(() => result.current.api!.highlight(['wall']));
  expect(objects.wall.highlighted).toBe(true);
  expect(objects.door.highlighted).toBe(false);
  act(() => result.current.api!.highlight([]));
  expect(objects.wall.highlighted).toBe(false);
  expect(objects.door.highlighted).toBe(false);
});
