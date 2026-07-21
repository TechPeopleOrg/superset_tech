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
import { cloneDeep } from 'lodash';
import { Dispatch } from 'redux';
import { clearDashboardHistory } from './dashboardLayout';
import { DashboardDevice } from '../util/deviceLayouts';
import { DashboardLayout, RootState } from '../types';

export const SET_ACTIVE_DEVICE = 'SET_ACTIVE_DEVICE';
export const SET_DEVICE_LAYOUT_TREE = 'SET_DEVICE_LAYOUT_TREE';

export interface SetActiveDeviceAction {
  type: typeof SET_ACTIVE_DEVICE;
  device: DashboardDevice;
  parkedDevice: DashboardDevice;
  parkedTree: DashboardLayout;
  parkedTreeWasEdited: boolean;
}

export interface SetDeviceLayoutTreeAction {
  type: typeof SET_DEVICE_LAYOUT_TREE;
  payload: { tree: DashboardLayout };
}

export function switchActiveDevice(device: DashboardDevice) {
  return (dispatch: Dispatch, getState: () => RootState): void => {
    const { dashboardState, dashboardLayout } = getState();
    const current: DashboardDevice = dashboardState.activeDevice ?? 'desktop';
    if (current === device) return;

    const parked = dashboardState.inactiveDeviceLayouts ?? {};
    const currentTree = dashboardLayout.present;
    const desktopTree = current === 'desktop' ? currentTree : parked.desktop;
    // a device without a stored version starts as a copy of the desktop tree
    const nextTree = parked[device] ?? cloneDeep(desktopTree ?? currentTree);

    dispatch({
      type: SET_ACTIVE_DEVICE,
      device,
      parkedDevice: current,
      parkedTree: currentTree,
      parkedTreeWasEdited: dashboardLayout.past.length > 0,
    } as SetActiveDeviceAction);
    dispatch({
      type: SET_DEVICE_LAYOUT_TREE,
      payload: { tree: nextTree },
    } as SetDeviceLayoutTreeAction);
    dispatch(clearDashboardHistory());
  };
}
