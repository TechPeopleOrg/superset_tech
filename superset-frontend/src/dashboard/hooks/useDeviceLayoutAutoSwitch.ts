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
import { useEffect } from 'react';
import { debounce } from 'lodash';
import { shallowEqual, useDispatch, useSelector } from 'react-redux';
import { JsonObject } from '@superset-ui/core';
import { switchActiveDevice } from '../actions/deviceLayouts';
import {
  DashboardDevice,
  getDeviceScreenWidth,
  isDeviceLayoutsEnabled,
  resolveActiveLayoutDevice,
} from '../util/deviceLayouts';

interface AutoSwitchState {
  dashboardInfo: { metadata?: JsonObject };
  dashboardState: { editMode?: boolean; activeDevice?: DashboardDevice };
}

const RESIZE_DEBOUNCE_MS = 300;

export function useDeviceLayoutAutoSwitch(): void {
  const dispatch = useDispatch();
  const { metadata, editMode, activeDevice } = useSelector(
    (state: AutoSwitchState) => ({
      metadata: state.dashboardInfo?.metadata,
      editMode: !!state.dashboardState.editMode,
      activeDevice: state.dashboardState.activeDevice ?? 'desktop',
    }),
    shallowEqual,
  );

  useEffect(() => {
    // auto-switching only makes sense for viewers of adaptive dashboards
    if (editMode || !isDeviceLayoutsEnabled(metadata)) return undefined;
    const handleResize = debounce(() => {
      const nextDevice = resolveActiveLayoutDevice(
        metadata,
        getDeviceScreenWidth(),
      );
      if (nextDevice !== activeDevice) {
        dispatch(switchActiveDevice(nextDevice));
      }
    }, RESIZE_DEBOUNCE_MS);
    window.addEventListener('resize', handleResize);
    return () => {
      handleResize.cancel();
      window.removeEventListener('resize', handleResize);
    };
  }, [dispatch, editMode, metadata, activeDevice]);
}
