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
import { render, screen, fireEvent } from 'spec/helpers/testing-library';
import { switchActiveDevice } from 'src/dashboard/actions/deviceLayouts';
import DeviceLayoutSwitcher from './DeviceLayoutSwitcher';

jest.mock('src/dashboard/actions/deviceLayouts', () => ({
  ...jest.requireActual('src/dashboard/actions/deviceLayouts'),
  switchActiveDevice: jest.fn(() => ({ type: 'MOCK_SWITCH_ACTIVE_DEVICE' })),
}));

const initialState = {
  dashboardInfo: { metadata: { device_layouts_enabled: true } },
  dashboardState: { activeDevice: 'desktop' },
};

beforeEach(() => {
  (switchActiveDevice as unknown as jest.Mock).mockClear();
});

test('renders three device options and dispatches switch on click', () => {
  render(<DeviceLayoutSwitcher />, {
    useRedux: true,
    initialState,
  });
  expect(screen.getByRole('radio', { name: /desktop/i })).toBeChecked();
  expect(screen.getByRole('radio', { name: /tablet/i })).not.toBeChecked();
  fireEvent.click(screen.getByRole('radio', { name: /mobile/i }));
  expect(switchActiveDevice).toHaveBeenCalledWith('mobile');
});

test('renders nothing when the dashboard flag is off', () => {
  const { container } = render(<DeviceLayoutSwitcher />, {
    useRedux: true,
    initialState: {
      ...initialState,
      dashboardInfo: { metadata: {} },
    },
  });
  expect(container).toBeEmptyDOMElement();
});
