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
  SET_ACTIVE_DEVICE,
  SET_DEVICE_LAYOUT_TREE,
  switchActiveDevice,
} from './deviceLayouts';
import { DashboardLayout, RootState } from '../types';

const desktopTree = {
  ROOT_ID: { id: 'ROOT_ID', type: 'ROOT', children: ['GRID_ID'] },
} as unknown as DashboardLayout;
const tabletTree = {
  ROOT_ID: { id: 'ROOT_ID', type: 'ROOT', children: [] },
} as unknown as DashboardLayout;

const makeGetState = () => () =>
  ({
    dashboardState: { activeDevice: 'desktop', inactiveDeviceLayouts: {} },
    dashboardLayout: { past: [], present: desktopTree, future: [] },
  }) as unknown as RootState;

test('switchActiveDevice parks current tree and loads a desktop copy', () => {
  const dispatch = jest.fn();
  switchActiveDevice('tablet')(dispatch, makeGetState());
  const [setActive, setTree, clear] = dispatch.mock.calls.map(call => call[0]);
  expect(setActive).toEqual(
    expect.objectContaining({
      type: SET_ACTIVE_DEVICE,
      device: 'tablet',
      parkedDevice: 'desktop',
      parkedTree: desktopTree,
      parkedTreeWasEdited: false,
    }),
  );
  expect(setTree.type).toBe(SET_DEVICE_LAYOUT_TREE);
  // fresh deep copy of desktop, not the same reference
  expect(setTree.payload.tree).toEqual(desktopTree);
  expect(setTree.payload.tree).not.toBe(desktopTree);
  expect(clear.type).toBe('@@redux-undo/CLEAR_HISTORY');
});

test('switchActiveDevice restores a parked tree as-is', () => {
  const dispatch = jest.fn();
  const getState = () =>
    ({
      dashboardState: {
        activeDevice: 'tablet',
        inactiveDeviceLayouts: { desktop: desktopTree },
      },
      dashboardLayout: { past: [tabletTree], present: tabletTree, future: [] },
    }) as unknown as RootState;
  switchActiveDevice('desktop')(dispatch, getState);
  const [setActive, setTree] = dispatch.mock.calls.map(call => call[0]);
  expect(setActive.parkedTreeWasEdited).toBe(true);
  expect(setTree.payload.tree).toBe(desktopTree);
});

test('switchActiveDevice is a no-op for the same device', () => {
  const dispatch = jest.fn();
  switchActiveDevice('desktop')(dispatch, makeGetState());
  expect(dispatch).not.toHaveBeenCalled();
});
