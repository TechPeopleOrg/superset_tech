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
import { SupersetClient } from '@superset-ui/core';
import { render, screen, waitFor } from 'spec/helpers/testing-library';
import { UserWithPermissionsAndRoles } from 'src/types/bootstrapTypes';
import { canUpload, canDelete } from './permissions';
import FileUploader from './index';

const roleWith = (
  perms: string[],
): Pick<UserWithPermissionsAndRoles, 'roles'> => ({
  roles: { Custom: perms.map(p => [p, 'FileUploader']) },
});

afterEach(() => {
  jest.restoreAllMocks();
});

test('canUpload true only with upload permission', () => {
  expect(canUpload(roleWith(['upload']))).toBe(true);
  expect(canUpload(roleWith(['view']))).toBe(false);
});

test('canDelete reflects delete permission', () => {
  expect(canDelete(roleWith(['delete']))).toBe(true);
  expect(canDelete(roleWith(['view']))).toBe(false);
});

test('renders the page title', async () => {
  jest
    .spyOn(SupersetClient, 'get')
    .mockResolvedValueOnce({ json: [] } as any);
  render(<FileUploader />, {
    useRedux: true,
    initialState: { user: roleWith(['view']) },
  });
  expect(screen.getByText('Files')).toBeInTheDocument();
});

test('hides the upload button when user lacks upload permission', async () => {
  jest
    .spyOn(SupersetClient, 'get')
    .mockResolvedValueOnce({ json: [] } as any);
  render(<FileUploader />, {
    useRedux: true,
    initialState: { user: roleWith(['view']) },
  });
  await waitFor(() =>
    expect(screen.queryByTestId('upload-btn')).not.toBeInTheDocument(),
  );
});

test('shows the upload button when user has upload permission', async () => {
  jest
    .spyOn(SupersetClient, 'get')
    .mockResolvedValueOnce({ json: [] } as any);
  render(<FileUploader />, {
    useRedux: true,
    initialState: { user: roleWith(['view', 'upload']) },
  });
  expect(await screen.findByTestId('upload-btn')).toBeInTheDocument();
});

test('shows a no-access state when user lacks view permission', async () => {
  const getSpy = jest.spyOn(SupersetClient, 'get');
  render(<FileUploader />, {
    useRedux: true,
    initialState: { user: roleWith([]) },
  });
  expect(
    await screen.findByText(/don.t have permission/i),
  ).toBeInTheDocument();
  expect(getSpy).not.toHaveBeenCalled();
});

test('shows error banner when storage is unavailable', async () => {
  jest.spyOn(SupersetClient, 'get').mockRejectedValueOnce({ status: 502 });
  render(<FileUploader />, {
    useRedux: true,
    initialState: { user: roleWith(['view']) },
  });
  expect(await screen.findByText(/unavailable/i)).toBeInTheDocument();
  expect(screen.getByRole('button', { name: /retry/i })).toBeInTheDocument();
});

test('retry re-fetches the file list after a failure', async () => {
  jest
    .spyOn(SupersetClient, 'get')
    .mockRejectedValueOnce({ status: 502 })
    .mockResolvedValueOnce({
      json: [{ id: '1', file_name: 'retry.pdf', category: 'doc' }],
    } as any);
  render(<FileUploader />, {
    useRedux: true,
    initialState: { user: roleWith(['view']) },
  });
  expect(await screen.findByText(/unavailable/i)).toBeInTheDocument();
  screen.getByRole('button', { name: /retry/i }).click();
  expect(await screen.findByText('retry.pdf')).toBeInTheDocument();
});

test('renders file list from API', async () => {
  jest.spyOn(SupersetClient, 'get').mockResolvedValueOnce({
    json: [{ id: '1', file_name: 'a.pdf', category: 'doc' }],
  } as any);
  render(<FileUploader />, {
    useRedux: true,
    initialState: { user: roleWith(['view']) },
  });
  expect(await screen.findByText('a.pdf')).toBeInTheDocument();
});

test('hides edit and delete actions without permission', async () => {
  jest.spyOn(SupersetClient, 'get').mockResolvedValueOnce({
    json: [{ id: '1', file_name: 'a.pdf', category: 'doc' }],
  } as any);
  render(<FileUploader />, {
    useRedux: true,
    initialState: { user: roleWith(['view']) },
  });
  await screen.findByText('a.pdf');
  expect(screen.queryByTestId('edit-file-1')).not.toBeInTheDocument();
  expect(screen.queryByTestId('delete-file-1')).not.toBeInTheDocument();
});

test('shows edit and delete actions with permission', async () => {
  jest.spyOn(SupersetClient, 'get').mockResolvedValueOnce({
    json: [{ id: '1', file_name: 'a.pdf', category: 'doc' }],
  } as any);
  render(<FileUploader />, {
    useRedux: true,
    initialState: { user: roleWith(['view', 'edit', 'delete']) },
  });
  await screen.findByText('a.pdf');
  expect(screen.getByTestId('edit-file-1')).toBeInTheDocument();
  expect(screen.getByTestId('delete-file-1')).toBeInTheDocument();
});
