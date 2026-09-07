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
import {
  render,
  screen,
  waitFor,
  userEvent,
  fireEvent,
  selectOption,
} from 'spec/helpers/testing-library';
import { UserWithPermissionsAndRoles } from 'src/types/bootstrapTypes';
import { canUpload, canDelete } from './permissions';
import FileUploader from './index';
import * as api from './api';

jest.mock('src/utils/copy', () => jest.fn(() => Promise.resolve()));

const roleWith = (
  perms: string[],
): Pick<UserWithPermissionsAndRoles, 'roles'> => ({
  roles: { Custom: perms.map(p => [p, 'FileUploader']) },
});

afterEach(() => {
  jest.restoreAllMocks();
});

test('canUpload true only with can_upload permission', () => {
  expect(canUpload(roleWith(['can_upload']))).toBe(true);
  expect(canUpload(roleWith(['can_view']))).toBe(false);
});

test('canDelete reflects can_delete permission', () => {
  expect(canDelete(roleWith(['can_delete']))).toBe(true);
  expect(canDelete(roleWith(['can_view']))).toBe(false);
});

test('renders the page title', async () => {
  jest.spyOn(SupersetClient, 'get').mockResolvedValueOnce({ json: [] } as any);
  render(<FileUploader />, {
    useRedux: true,
    initialState: { user: roleWith(['can_view']) },
  });
  expect(screen.getByText('Files')).toBeInTheDocument();
});

test('hides the upload button when user lacks upload permission', async () => {
  jest.spyOn(SupersetClient, 'get').mockResolvedValueOnce({ json: [] } as any);
  render(<FileUploader />, {
    useRedux: true,
    initialState: { user: roleWith(['can_view']) },
  });
  await waitFor(() =>
    expect(screen.queryByTestId('upload-btn')).not.toBeInTheDocument(),
  );
});

test('shows the upload button when user has upload permission', async () => {
  jest.spyOn(SupersetClient, 'get').mockResolvedValueOnce({ json: [] } as any);
  render(<FileUploader />, {
    useRedux: true,
    initialState: { user: roleWith(['can_view', 'can_upload']) },
  });
  expect(await screen.findByTestId('upload-btn')).toBeInTheDocument();
});

test('shows a no-access state when user lacks view permission', async () => {
  const getSpy = jest.spyOn(SupersetClient, 'get');
  render(<FileUploader />, {
    useRedux: true,
    initialState: { user: roleWith([]) },
  });
  expect(await screen.findByText(/don.t have permission/i)).toBeInTheDocument();
  expect(getSpy).not.toHaveBeenCalled();
});

test('shows error banner when storage is unavailable', async () => {
  jest.spyOn(SupersetClient, 'get').mockRejectedValueOnce({ status: 502 });
  render(<FileUploader />, {
    useRedux: true,
    initialState: { user: roleWith(['can_view']) },
  });
  expect(await screen.findByText(/unavailable/i)).toBeInTheDocument();
  expect(screen.getByRole('button', { name: /retry/i })).toBeInTheDocument();
});

test('retry re-fetches the file list after a failure', async () => {
  jest
    .spyOn(SupersetClient, 'get')
    .mockRejectedValueOnce({ status: 502 })
    .mockResolvedValueOnce({
      json: [
        {
          id: '1',
          uuid: 'uuid-1',
          name: 'Retry doc',
          file_name: 'retry.pdf',
          category: 'doc',
        },
      ],
    } as any);
  render(<FileUploader />, {
    useRedux: true,
    initialState: { user: roleWith(['can_view']) },
  });
  expect(await screen.findByText(/unavailable/i)).toBeInTheDocument();
  screen.getByRole('button', { name: /retry/i }).click();
  expect(await screen.findByText('retry.pdf')).toBeInTheDocument();
});

test('renders file list from API', async () => {
  jest.spyOn(SupersetClient, 'get').mockResolvedValueOnce({
    json: [
      {
        id: '1',
        uuid: 'uuid-1',
        name: 'A doc',
        file_name: 'a.pdf',
        category: 'doc',
      },
    ],
  } as any);
  render(<FileUploader />, {
    useRedux: true,
    initialState: { user: roleWith(['can_view']) },
  });
  expect(await screen.findByText('a.pdf')).toBeInTheDocument();
});

test('renders file list from API when response is wrapped in items envelope', async () => {
  jest.spyOn(SupersetClient, 'get').mockResolvedValueOnce({
    json: {
      items: [
        {
          id: '1',
          uuid: 'uuid-1',
          name: 'B doc',
          file_name: 'b.pdf',
          category: 'doc',
        },
      ],
    },
  } as any);
  render(<FileUploader />, {
    useRedux: true,
    initialState: { user: roleWith(['can_view']) },
  });
  expect(await screen.findByText('b.pdf')).toBeInTheDocument();
});

test('shows the user-entered name, not just the raw file name', async () => {
  jest.spyOn(SupersetClient, 'get').mockResolvedValueOnce({
    json: [
      {
        id: '1',
        uuid: 'uuid-1',
        name: 'My Renamed File',
        file_name: 'original-upload.pdf',
        category: 'doc',
      },
    ],
  } as any);
  render(<FileUploader />, {
    useRedux: true,
    initialState: { user: roleWith(['can_view']) },
  });
  expect(await screen.findByText('My Renamed File')).toBeInTheDocument();
  expect(screen.getByText('original-upload.pdf')).toBeInTheDocument();
});

test('hides edit and delete actions without permission', async () => {
  jest.spyOn(SupersetClient, 'get').mockResolvedValueOnce({
    json: [
      {
        id: '1',
        uuid: 'uuid-1',
        name: 'A doc',
        file_name: 'a.pdf',
        category: 'doc',
      },
    ],
  } as any);
  render(<FileUploader />, {
    useRedux: true,
    initialState: { user: roleWith(['can_view']) },
  });
  await screen.findByText('a.pdf');
  expect(screen.queryByTestId('edit-file-uuid-1')).not.toBeInTheDocument();
  expect(screen.queryByTestId('delete-file-uuid-1')).not.toBeInTheDocument();
});

test('shows edit and delete actions with permission', async () => {
  jest.spyOn(SupersetClient, 'get').mockResolvedValueOnce({
    json: [
      {
        id: '1',
        uuid: 'uuid-1',
        name: 'A doc',
        file_name: 'a.pdf',
        category: 'doc',
      },
    ],
  } as any);
  render(<FileUploader />, {
    useRedux: true,
    initialState: {
      user: roleWith(['can_view', 'can_edit', 'can_delete']),
    },
  });
  await screen.findByText('a.pdf');
  expect(screen.getByTestId('edit-file-uuid-1')).toBeInTheDocument();
  expect(screen.getByTestId('delete-file-uuid-1')).toBeInTheDocument();
});

const openUploadModal = async () => {
  render(<FileUploader />, {
    useRedux: true,
    initialState: { user: roleWith(['can_view', 'can_upload']) },
  });
  const uploadBtn = await screen.findByTestId('upload-btn');
  userEvent.click(uploadBtn);
  await screen.findByText('Upload file');
};

const selectAFile = async (fileName = 'model.ifc') => {
  const fileInput = (await screen.findByTestId(
    'upload-file-input',
  )) as HTMLInputElement;
  const testFile = new File([new ArrayBuffer(1)], fileName);
  // antd's rc-upload spreads `event.target.files` (expects an iterable
  // FileList). @testing-library/user-event's `upload()` helper in this
  // repo's installed version builds a files object that is not iterable,
  // so we dispatch the change event manually with a real iterable list.
  Object.defineProperty(fileInput, 'files', {
    value: [testFile],
    configurable: true,
  });
  fireEvent.change(fileInput);
};

test('upload primary button is disabled until file, name and category are set', async () => {
  jest.spyOn(SupersetClient, 'get').mockResolvedValueOnce({ json: [] } as any);
  await openUploadModal();

  const uploadModalPrimaryBtn = screen.getByTestId('modal-confirm-button');
  expect(uploadModalPrimaryBtn).toBeDisabled();

  await selectAFile('model.ifc');
  expect(uploadModalPrimaryBtn).toBeDisabled();

  await selectOption('bim', 'Category');
  expect(uploadModalPrimaryBtn).toBeEnabled();
});

test('onUpload sends a FormData with name and category populated', async () => {
  jest
    .spyOn(SupersetClient, 'get')
    .mockResolvedValueOnce({ json: [] } as any)
    .mockResolvedValueOnce({ json: [] } as any);
  const uploadSpy = jest
    .spyOn(api, 'uploadFile')
    .mockResolvedValueOnce({} as any);

  await openUploadModal();
  await selectAFile('model.ifc');
  await selectOption('bim', 'Category');

  const uploadModalPrimaryBtn = screen.getByTestId('modal-confirm-button');
  await waitFor(() => expect(uploadModalPrimaryBtn).toBeEnabled());
  userEvent.click(uploadModalPrimaryBtn);

  await waitFor(() => expect(uploadSpy).toHaveBeenCalledTimes(1));
  const sentFormData = uploadSpy.mock.calls[0][0] as FormData;
  expect(sentFormData.get('name')).toBe('model.ifc');
  expect(sentFormData.get('category')).toBe('bim');
  expect(sentFormData.get('file')).toBeInstanceOf(File);
});

test('onConfirmDelete closes the delete modal and refreshes the list on success', async () => {
  const getSpy = jest
    .spyOn(SupersetClient, 'get')
    .mockResolvedValueOnce({
      json: [
        {
          id: '1',
          uuid: 'uuid-1',
          name: 'A doc',
          file_name: 'a.pdf',
          category: 'doc',
        },
      ],
    } as any)
    .mockResolvedValueOnce({ json: [] } as any);
  const deleteSpy = jest
    .spyOn(api, 'deleteFile')
    .mockResolvedValueOnce({} as any);

  render(<FileUploader />, {
    useRedux: true,
    initialState: { user: roleWith(['can_view', 'can_delete']) },
  });

  await screen.findByText('a.pdf');
  userEvent.click(screen.getByTestId('delete-file-uuid-1'));

  const confirmInput = await screen.findByTestId('delete-modal-input');
  userEvent.type(confirmInput, 'DELETE');
  const confirmBtn = screen.getByTestId('modal-confirm-button');
  await waitFor(() => expect(confirmBtn).toBeEnabled());
  userEvent.click(confirmBtn);

  await waitFor(() => expect(deleteSpy).toHaveBeenCalledWith('uuid-1'));
  await waitFor(() =>
    expect(screen.queryByText('Delete file')).not.toBeInTheDocument(),
  );
  // initial load + reload after delete
  await waitFor(() => expect(getSpy).toHaveBeenCalledTimes(2));
});

test('renders Folder and Tags column values', async () => {
  jest.spyOn(SupersetClient, 'get').mockResolvedValueOnce({
    json: [
      {
        id: '1',
        uuid: 'uuid-1',
        name: 'A doc',
        file_name: 'a.pdf',
        category: 'doc',
        folder: 'projects/2026',
        tags: ['draft', 'urgent'],
      },
    ],
  } as any);
  render(<FileUploader />, {
    useRedux: true,
    initialState: { user: roleWith(['can_view']) },
  });
  expect(await screen.findByText('projects/2026')).toBeInTheDocument();
  expect(screen.getByText('draft, urgent')).toBeInTheDocument();
});

test('edit modal does not contain a Category field and onSaveEdit PATCHes without category', async () => {
  jest
    .spyOn(SupersetClient, 'get')
    .mockResolvedValueOnce({
      json: [
        {
          id: '1',
          uuid: 'uuid-1',
          name: 'A doc',
          file_name: 'a.pdf',
          category: 'doc',
          folder: 'old-folder',
          tags: ['one', 'two'],
        },
      ],
    } as any)
    .mockResolvedValueOnce({ json: [] } as any);
  const updateSpy = jest
    .spyOn(api, 'updateFile')
    .mockResolvedValueOnce({} as any);

  render(<FileUploader />, {
    useRedux: true,
    initialState: { user: roleWith(['can_view', 'can_edit']) },
  });

  await screen.findByText('a.pdf');
  userEvent.click(screen.getByTestId('edit-file-uuid-1'));

  await screen.findByText('Edit file');
  expect(screen.queryByTestId('edit-category-input')).not.toBeInTheDocument();
  expect(screen.queryByLabelText('Category')).not.toBeInTheDocument();

  const nameInput = screen.getByTestId('edit-file-name-input');
  userEvent.clear(nameInput);
  userEvent.type(nameInput, 'New Name');

  const folderInput = screen.getByTestId('edit-folder-input');
  userEvent.clear(folderInput);
  userEvent.type(folderInput, 'new-folder');

  const tagsInput = screen.getByTestId('edit-tags-input');
  userEvent.clear(tagsInput);
  userEvent.type(tagsInput, 'alpha, beta ,gamma');

  const saveBtn = screen.getByTestId('modal-confirm-button');
  userEvent.click(saveBtn);

  await waitFor(() => expect(updateSpy).toHaveBeenCalledTimes(1));
  expect(updateSpy).toHaveBeenCalledWith('uuid-1', {
    name: 'New Name',
    folder: 'new-folder',
    tags: ['alpha', 'beta', 'gamma'],
  });
});

test('clicking the preview icon opens the preview modal and renders an image for an image-type row', async () => {
  jest.spyOn(SupersetClient, 'get').mockResolvedValueOnce({
    json: [
      {
        id: '1',
        uuid: 'uuid-1',
        name: 'A photo',
        file_name: 'photo.png',
        category: 'image',
        content_type: 'image/png',
      },
    ],
  } as any);
  render(<FileUploader />, {
    useRedux: true,
    initialState: { user: roleWith(['can_view']) },
  });

  await screen.findByText('photo.png');
  userEvent.click(screen.getByTestId('preview-file-uuid-1'));

  const image = await screen.findByTestId('preview-file-image');
  expect(image).toHaveAttribute(
    'src',
    expect.stringContaining('/fileuploader/api/files/uuid-1/content'),
  );
});

test('clicking the download icon triggers a download of the file bytes', async () => {
  jest.spyOn(SupersetClient, 'get').mockResolvedValueOnce({
    json: [
      {
        id: '1',
        uuid: 'uuid-1',
        name: 'A model',
        file_name: 'model.xkt',
        category: 'bim',
      },
    ],
  } as any);
  // Capture the anchor the download helper creates and clicks.
  const clickSpy = jest
    .spyOn(HTMLAnchorElement.prototype, 'click')
    .mockImplementation(() => {});
  render(<FileUploader />, {
    useRedux: true,
    initialState: { user: roleWith(['can_view']) },
  });

  await screen.findByText('model.xkt');
  const anchor = screen.getByTestId('download-file-uuid-1');
  userEvent.click(anchor);

  expect(clickSpy).toHaveBeenCalled();
  const created = clickSpy.mock.instances[0] as unknown as HTMLAnchorElement;
  expect(created.href).toContain('/fileuploader/api/files/uuid-1/content');
  expect(created.download).toBe('model.xkt');
  clickSpy.mockRestore();
});

test('onUpload shows the validation error inside the modal and keeps it open on failure', async () => {
  jest.spyOn(SupersetClient, 'get').mockResolvedValueOnce({ json: [] } as any);
  jest.spyOn(api, 'uploadFile').mockRejectedValueOnce({
    json: async () => ({
      detail: 'Extension .svg not allowed for category image',
    }),
  });

  await openUploadModal();
  await selectAFile('icon.svg');
  await selectOption('image', 'Category');

  const uploadModalPrimaryBtn = screen.getByTestId('modal-confirm-button');
  await waitFor(() => expect(uploadModalPrimaryBtn).toBeEnabled());
  userEvent.click(uploadModalPrimaryBtn);

  expect(
    await screen.findByText('Extension .svg not allowed for category image'),
  ).toBeInTheDocument();
  // modal stays open so the user can fix the category and retry
  expect(screen.getByText('Upload file')).toBeInTheDocument();
  expect(uploadModalPrimaryBtn).toBeInTheDocument();
});

test('clicking the copy-uuid button calls copyTextToClipboard with the file uuid', async () => {
  const copyMock = jest.requireMock('src/utils/copy') as jest.Mock;
  copyMock.mockClear();

  jest.spyOn(SupersetClient, 'get').mockResolvedValueOnce({
    json: [
      {
        id: '1',
        uuid: 'abcdef12-0000-0000-0000-000000000099',
        name: 'A doc',
        file_name: 'a.pdf',
        category: 'doc',
      },
    ],
  } as any);
  render(<FileUploader />, {
    useRedux: true,
    initialState: { user: roleWith(['can_view']) },
  });

  await screen.findByText('a.pdf');
  userEvent.click(
    screen.getByTestId('copy-uuid-abcdef12-0000-0000-0000-000000000099'),
  );

  await waitFor(() => expect(copyMock).toHaveBeenCalledTimes(1));
  // The first argument is a getter function; calling it should return the uuid
  const getter = copyMock.mock.calls[0][0] as () => Promise<string>;
  await expect(getter()).resolves.toBe('abcdef12-0000-0000-0000-000000000099');
});
