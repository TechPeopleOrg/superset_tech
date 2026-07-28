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
import userEvent from '@testing-library/user-event';
import { render, screen } from 'spec/helpers/testing-library';
import ViewerControls from '../src/ViewerControls';

const setup = (navMode: 'orbit' | 'firstPerson' = 'orbit') => {
  const onNavModeChange = jest.fn();
  const onFit = jest.fn();
  render(
    <ViewerControls
      navMode={navMode}
      onNavModeChange={onNavModeChange}
      onFit={onFit}
    />,
  );
  return { onNavModeChange, onFit };
};

test('marks the active navigation mode as pressed', () => {
  setup('orbit');
  expect(screen.getByTestId('bim-nav-orbit')).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  expect(screen.getByTestId('bim-nav-first-person')).toHaveAttribute(
    'aria-pressed',
    'false',
  );
});

test('clicking a mode toggle reports the chosen mode', async () => {
  const { onNavModeChange } = setup('orbit');
  await userEvent.click(screen.getByTestId('bim-nav-first-person'));
  expect(onNavModeChange).toHaveBeenCalledWith('firstPerson');
});

test('clicking fit calls onFit', async () => {
  const { onFit } = setup('orbit');
  await userEvent.click(screen.getByTestId('bim-fit'));
  expect(onFit).toHaveBeenCalledTimes(1);
});
