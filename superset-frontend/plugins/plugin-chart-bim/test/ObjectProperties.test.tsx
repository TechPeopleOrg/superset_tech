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
import { render, screen } from 'spec/helpers/testing-library';
import userEvent from '@testing-library/user-event';
import ObjectProperties from '../src/ObjectProperties';
import type { ObjectInfo } from '../src/types';

const info: ObjectInfo = {
  id: '2O2Fr$t4X7Zf8NOew3FLKU',
  name: 'Basic Wall',
  type: 'IfcWall',
  path: ['Project', 'Level 1'],
  ancestorIds: ['storey', 'project'],
};

test('renders the model metadata for the selected object', () => {
  render(<ObjectProperties info={info} row={undefined} onClose={jest.fn()} />);

  expect(screen.getByText('Basic Wall')).toBeInTheDocument();
  expect(screen.getByText('IfcWall')).toBeInTheDocument();
  expect(screen.getByText('2O2Fr$t4X7Zf8NOew3FLKU')).toBeInTheDocument();
  expect(screen.getByText('Project / Level 1')).toBeInTheDocument();
});

test('renders every column of the matching dataset row', () => {
  render(
    <ObjectProperties
      info={info}
      row={{ status: 'В работе', finish: '2026-08-01' }}
      onClose={jest.fn()}
    />,
  );

  expect(screen.getByText('status')).toBeInTheDocument();
  expect(screen.getByText('В работе')).toBeInTheDocument();
  expect(screen.getByText('finish')).toBeInTheDocument();
  expect(screen.getByText('2026-08-01')).toBeInTheDocument();
});

test('tells the user when the element has no data row', () => {
  render(<ObjectProperties info={info} row={undefined} onClose={jest.fn()} />);

  expect(screen.getByTestId('bim-props-no-data')).toBeInTheDocument();
});

test('flags a row inherited from an ancestor element', () => {
  render(
    <ObjectProperties
      info={info}
      row={{ status: 'Done' }}
      inheritedFrom="Basic Wall"
      onClose={jest.fn()}
    />,
  );

  expect(screen.getByTestId('bim-props-inherited')).toHaveTextContent(
    'Basic Wall',
  );
});

test('does not flag inheritance for a direct row match', () => {
  render(
    <ObjectProperties
      info={info}
      row={{ status: 'Done' }}
      onClose={jest.fn()}
    />,
  );

  expect(screen.queryByTestId('bim-props-inherited')).not.toBeInTheDocument();
});

test('renders empty and null cells as a dash rather than blank', () => {
  render(
    <ObjectProperties
      info={info}
      row={{ status: null, note: '' }}
      onClose={jest.fn()}
    />,
  );

  expect(screen.getByTestId('bim-props-value-status')).toHaveTextContent('—');
  expect(screen.getByTestId('bim-props-value-note')).toHaveTextContent('—');
});

test('omits the hierarchy line for a root object', () => {
  render(
    <ObjectProperties
      info={{ ...info, path: [] }}
      row={undefined}
      onClose={jest.fn()}
    />,
  );

  expect(screen.queryByTestId('bim-props-path')).not.toBeInTheDocument();
});

test('closes when the close button is clicked', async () => {
  const onClose = jest.fn();
  render(<ObjectProperties info={info} row={undefined} onClose={onClose} />);

  await userEvent.click(screen.getByRole('button', { name: /close/i }));

  expect(onClose).toHaveBeenCalled();
});
