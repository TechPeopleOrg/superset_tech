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
import { ReactNode, useCallback } from 'react';
import { shallowEqual, useDispatch, useSelector } from 'react-redux';
import { JsonObject } from '@superset-ui/core';
import { css, useTheme } from '@apache-superset/core/theme';
import { t } from '@apache-superset/core/translation';
import { Tooltip } from '@superset-ui/core/components';
import { Icons } from '@superset-ui/core/components/Icons';
import { Radio, RadioChangeEvent } from '@superset-ui/core/components/Radio';
import { switchActiveDevice } from 'src/dashboard/actions/deviceLayouts';
import {
  DashboardDevice,
  isDeviceLayoutsEnabled,
} from 'src/dashboard/util/deviceLayouts';

interface DeviceSwitcherState {
  dashboardInfo: { metadata?: JsonObject };
  dashboardState: { activeDevice?: DashboardDevice };
}

const DEVICE_OPTIONS: {
  value: DashboardDevice;
  label: string;
  icon: ReactNode;
}[] = [
  { value: 'desktop', label: t('Desktop'), icon: <Icons.DesktopOutlined /> },
  { value: 'tablet', label: t('Tablet'), icon: <Icons.TabletOutlined /> },
  { value: 'mobile', label: t('Mobile'), icon: <Icons.MobileOutlined /> },
];

export default function DeviceLayoutSwitcher() {
  const dispatch = useDispatch();
  const theme = useTheme();
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
    <Radio.Group
      value={activeDevice}
      onChange={handleChange}
      data-test="device-layout-switcher"
      css={css`
        display: inline-flex;
        align-items: center;
        margin-right: ${theme.sizeUnit * 4}px;

        /* match the rendered height of small superset buttons (e.g. Discard) */
        .ant-radio-button-wrapper {
          height: 32px;
          display: inline-flex;
          align-items: center;
        }
      `}
    >
      {DEVICE_OPTIONS.map(({ value, label, icon }) => (
        <Tooltip
          key={value}
          id={`device-layout-switcher-${value}-tooltip`}
          title={label}
        >
          <Radio.Button value={value} aria-label={label}>
            {icon}
          </Radio.Button>
        </Tooltip>
      ))}
    </Radio.Group>
  );
}
