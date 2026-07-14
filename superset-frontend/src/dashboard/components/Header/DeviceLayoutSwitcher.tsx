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
import { useCallback } from 'react';
import { shallowEqual, useDispatch, useSelector } from 'react-redux';
import { JsonObject } from '@superset-ui/core';
import { t } from '@apache-superset/core/translation';
import { Tooltip } from '@superset-ui/core/components';
import {
  Radio,
  RadioChangeEvent,
} from '@superset-ui/core/components/Radio';
import { switchActiveDevice } from 'src/dashboard/actions/deviceLayouts';
import {
  DashboardDevice,
  isDeviceLayoutsEnabled,
} from 'src/dashboard/util/deviceLayouts';

interface DeviceSwitcherState {
  dashboardInfo: { metadata?: JsonObject };
  dashboardState: { activeDevice?: DashboardDevice };
}

const DEVICE_OPTIONS: { value: DashboardDevice; label: string }[] = [
  { value: 'desktop', label: t('Desktop') },
  { value: 'tablet', label: t('Tablet') },
  { value: 'mobile', label: t('Mobile') },
];

export default function DeviceLayoutSwitcher() {
  const dispatch = useDispatch();
  const { enabled, activeDevice } = useSelector(
    (state: DeviceSwitcherState) => ({
      enabled: isDeviceLayoutsEnabled(state.dashboardInfo?.metadata),
      activeDevice: state.dashboardState.activeDevice ?? 'desktop',
    }),
    shallowEqual,
  );
  const handleChange = useCallback(
    (event: RadioChangeEvent) => {
      dispatch(switchActiveDevice(event.target.value as DashboardDevice));
    },
    [dispatch],
  );

  if (!enabled) return null;

  return (
    <Tooltip
      id="device-layout-switcher-tooltip"
      title={t('Edit the dashboard version for a specific device')}
    >
      <Radio.Group
        value={activeDevice}
        onChange={handleChange}
        size="small"
        data-test="device-layout-switcher"
      >
        {DEVICE_OPTIONS.map(({ value, label }) => (
          <Radio.Button key={value} value={value}>
            {label}
          </Radio.Button>
        ))}
      </Radio.Group>
    </Tooltip>
  );
}
