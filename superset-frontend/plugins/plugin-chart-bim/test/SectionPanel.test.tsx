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
import SectionPanel from '../src/SectionPanel';
import type { ModelBounds, SectionAxis } from '../src/types';

const BOUNDS: ModelBounds = { x: [0, 100], y: [-8400, 60000], z: [0, 50] };

const setup = (
  props: Partial<React.ComponentProps<typeof SectionPanel>> = {},
) => {
  const handlers = {
    onAxisChange: jest.fn(),
    onPositionChange: jest.fn(),
    onFlip: jest.fn(),
    onReset: jest.fn(),
    onClose: jest.fn(),
  };
  render(
    <SectionPanel
      bounds={BOUNDS}
      axis={null}
      position={0}
      flipped={false}
      {...handlers}
      {...props}
    />,
  );
  return handlers;
};

test('marks the active axis as pressed and leaves the others unpressed', () => {
  setup({ axis: 'y' });
  expect(screen.getByTestId('bim-section-axis-y')).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  expect(screen.getByTestId('bim-section-axis-x')).toHaveAttribute(
    'aria-pressed',
    'false',
  );
});

test('selecting an axis reports it', async () => {
  const { onAxisChange } = setup();
  await userEvent.click(screen.getByTestId('bim-section-axis-y'));
  expect(onAxisChange).toHaveBeenCalledWith('y');
});

test('clicking the live axis switches the section off', async () => {
  const { onAxisChange } = setup({ axis: 'y' });
  await userEvent.click(screen.getByTestId('bim-section-axis-y'));
  expect(onAxisChange).toHaveBeenCalledWith(null);
});

test('shows no slider until an axis is chosen', () => {
  setup();
  expect(screen.queryByTestId('bim-section-slider')).not.toBeInTheDocument();
  expect(screen.getByText('Pick an axis to cut along.')).toBeInTheDocument();
});

test('waits for the model when bounds are unavailable', () => {
  setup({ bounds: undefined, axis: 'y' });
  expect(screen.queryByTestId('bim-section-slider')).not.toBeInTheDocument();
  expect(screen.getByText('Waiting for the model…')).toBeInTheDocument();
});

test('renders the rounded position of the active plane', () => {
  setup({ axis: 'y', position: 12999.6 });
  expect(screen.getByTestId('bim-section-value')).toHaveTextContent('13000');
});

test('flip reports and reads as reversible once flipped', async () => {
  const { onFlip } = setup({ axis: 'y', flipped: true });
  const flip = screen.getByTestId('bim-section-flip');
  expect(flip).toHaveTextContent('Flip back');
  await userEvent.click(flip);
  expect(onFlip).toHaveBeenCalled();
});

test('closing the panel reports it', async () => {
  const { onClose } = setup();
  await userEvent.click(screen.getByTestId('bim-section-close'));
  expect(onClose).toHaveBeenCalled();
});

test('the slider spans the chosen axis bounds', () => {
  const axis: SectionAxis = 'y';
  setup({ axis, position: 0 });
  const slider = screen.getByRole('slider');
  expect(slider).toHaveAttribute('aria-valuemin', String(BOUNDS[axis][0]));
  expect(slider).toHaveAttribute('aria-valuemax', String(BOUNDS[axis][1]));
});

test('offers only the two cutting axes', () => {
  setup();
  expect(screen.getByTestId('bim-section-axis-x')).toBeInTheDocument();
  expect(screen.getByTestId('bim-section-axis-y')).toBeInTheDocument();
  expect(screen.queryByTestId('bim-section-axis-z')).not.toBeInTheDocument();
});

test('reset reports and is offered next to flip', async () => {
  const { onReset } = setup({ axis: 'y', position: 500 });
  await userEvent.click(screen.getByTestId('bim-section-reset'));
  expect(onReset).toHaveBeenCalled();
});

test('no reset button before an axis is chosen', () => {
  setup();
  expect(screen.queryByTestId('bim-section-reset')).not.toBeInTheDocument();
});
