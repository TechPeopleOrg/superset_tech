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
  render,
  screen,
  selectOption,
  userEvent,
  waitFor,
} from 'spec/helpers/testing-library';
import SaveReportModal, { todayIsoDate } from './SaveReportModal';
import * as api from './api';

const source = { type: 'dashboard' as const, id: 10, name: 'Progress' };

const renderModal = (overrides = {}) => {
  const props = {
    show: true,
    onHide: jest.fn(),
    capture: jest.fn().mockResolvedValue({
      dataUrl: 'data:image/png;base64,AA',
      fileName: 'r.png',
    }),
    source,
    addSuccessToast: jest.fn(),
    addDangerToast: jest.fn(),
    ...overrides,
  };
  return { props, ...render(<SaveReportModal {...props} />) };
};

test('todayIsoDate uses the local calendar day, not UTC', () => {
  // 00:30 local on the 5th: toISOString() in a positive-offset zone would
  // report the 4th, which would file the report under the wrong day.
  expect(todayIsoDate(new Date(2026, 8, 5, 0, 30))).toBe('2026-09-05');
});

test('save is blocked until a description is entered', async () => {
  renderModal();
  const save = screen.getByRole('button', { name: /save/i });
  expect(save).toBeDisabled();

  userEvent.type(screen.getByTestId('report-description'), 'Leak at A-12');
  await waitFor(() => expect(save).toBeEnabled());
});

test('saving captures the snapshot and sends the form values', async () => {
  const saveReport = jest
    .spyOn(api, 'saveReport')
    .mockResolvedValue({} as never);
  const { props } = renderModal();

  userEvent.type(screen.getByTestId('report-description'), 'Leak at A-12');
  await waitFor(() =>
    expect(screen.getByRole('button', { name: /save/i })).toBeEnabled(),
  );
  userEvent.click(screen.getByRole('button', { name: /save/i }));

  await waitFor(() => expect(saveReport).toHaveBeenCalled());
  // Whole page is the default scope.
  expect(props.capture).toHaveBeenCalledWith(true);
  expect(saveReport.mock.calls[0][0]).toMatchObject({
    description: 'Leak at A-12',
    fileName: 'r.png',
    name: 'Progress',
    source,
  });
  await waitFor(() => expect(props.onHide).toHaveBeenCalled());
  saveReport.mockRestore();
});

test('a failed capture reports the error and keeps the dialog open', async () => {
  const saveReport = jest.spyOn(api, 'saveReport');
  const { props } = renderModal({
    capture: jest.fn().mockRejectedValue(new Error('nothing to capture')),
  });

  userEvent.type(screen.getByTestId('report-description'), 'Leak');
  await waitFor(() =>
    expect(screen.getByRole('button', { name: /save/i })).toBeEnabled(),
  );
  userEvent.click(screen.getByRole('button', { name: /save/i }));

  await waitFor(() => expect(props.addDangerToast).toHaveBeenCalled());
  expect(saveReport).not.toHaveBeenCalled();
  expect(props.onHide).not.toHaveBeenCalled();
  saveReport.mockRestore();
});

test('the visible-area scope is passed through to the capture', async () => {
  const saveReport = jest
    .spyOn(api, 'saveReport')
    .mockResolvedValue({} as never);
  const { props } = renderModal();

  userEvent.type(screen.getByTestId('report-description'), 'Leak');
  await selectOption('Visible area only', 'Snapshot area');
  await waitFor(() =>
    expect(screen.getByRole('button', { name: /save/i })).toBeEnabled(),
  );
  userEvent.click(screen.getByRole('button', { name: /save/i }));

  await waitFor(() => expect(props.capture).toHaveBeenCalledWith(false));
  saveReport.mockRestore();
});
