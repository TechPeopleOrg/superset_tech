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
import { useCallback, useEffect, useState } from 'react';
import { useSelector } from 'react-redux';
import { t } from '@apache-superset/core/translation';
import { Alert } from '@apache-superset/core/components';
import { getClientErrorObject } from '@superset-ui/core';
import { css, styled } from '@apache-superset/core/theme';
import copyTextToClipboard from 'src/utils/copy';
import withToasts from 'src/components/MessageToasts/withToasts';
import {
  Button,
  DeleteModal,
  FormLabel,
  Input,
  Modal,
  Select,
  Table,
  Tooltip,
  Upload,
  type ColumnsType,
  type UploadFile,
} from '@superset-ui/core/components';
import { Icons } from '@superset-ui/core/components/Icons';
import SubMenu from 'src/features/home/SubMenu';
import { RootState } from 'src/dashboard/types';
import { canView, canUpload, canEdit, canDelete } from './permissions';
import {
  StorageFile,
  fetchFiles,
  uploadFile,
  updateFile,
  deleteFile,
  fileContentUrl,
} from './api';

interface ToastProps {
  addSuccessToast: (msg: string) => void;
  addDangerToast: (msg: string) => void;
}

interface EditState {
  uuid: string;
  name: string;
  folder: string;
  tags: string;
}

const isImageLike = (file: StorageFile): boolean =>
  Boolean(file.content_type?.startsWith('image/')) ||
  file.category === 'image' ||
  file.category === 'svg';

const StyledContent = styled.div`
  ${({ theme }) => css`
    padding: ${theme.sizeUnit * 4}px;
  `}
`;

const StyledToolbar = styled.div`
  ${({ theme }) => css`
    display: flex;
    justify-content: flex-end;
    margin-bottom: ${theme.sizeUnit * 4}px;
  `}
`;

const StyledActions = styled.div`
  .action-button {
    display: inline-block;
    height: 100%;
    color: ${({ theme }) => theme.colorIcon};
    margin-right: ${({ theme }) => theme.sizeUnit * 2}px;

    &:last-of-type {
      margin-right: 0;
    }
  }
`;

const UPLOAD_CATEGORY_OPTIONS = [
  { value: 'bim', label: 'bim' },
  { value: 'image', label: 'image' },
  { value: 'svg', label: 'svg' },
];

const uploadErrorFallback = () =>
  t('Upload failed. Please check the file and category and try again.');

// Narrow shape covering the ways an upload failure can surface a message:
// SupersetClient rejects HTTP errors with the raw `Response` (has `.json()`),
// but errors can also arrive already-parsed (`.json`/`.body` objects) or as
// a plain `Error`-like object (`.message`/`.error`).
interface UploadErrorLike {
  json?: (() => Promise<unknown>) | { detail?: string; message?: string };
  body?: { detail?: string; message?: string };
  message?: string;
  error?: string;
}

function readDetail(value: unknown): string | undefined {
  if (value && typeof value === 'object') {
    const { detail, message, error } = value as {
      detail?: unknown;
      message?: unknown;
      error?: unknown;
    };
    if (typeof detail === 'string' && detail) return detail;
    if (typeof message === 'string' && message) return message;
    if (typeof error === 'string' && error) return error;
  }
  return undefined;
}

// Extracts a human-readable message from an upload failure. SupersetClient
// rejects HTTP errors with the raw `Response` object (has a `.json()`
// method) carrying the storage service's `{ detail: "..." }` body, so we
// read that directly first. If that yields nothing (e.g. a non-JSON body),
// we fall back to getClientErrorObject - the codebase's standard
// SupersetClient error parser, which also understands network/timeout
// errors - then to already-parsed shapes, then a generic message.
async function extractErrorMessage(err: unknown): Promise<string> {
  if (!err || typeof err !== 'object') {
    return uploadErrorFallback();
  }
  const errObj = err as UploadErrorLike;

  if (typeof errObj.json === 'function') {
    try {
      const parsed = await (errObj.json as () => Promise<unknown>)();
      const detail = readDetail(parsed);
      if (detail) return detail;
    } catch {
      // fall through to getClientErrorObject, which can fall back to
      // reading the response body as text
    }
    try {
      const clientError = await getClientErrorObject(
        err as Parameters<typeof getClientErrorObject>[0],
      );
      const detail = readDetail(clientError);
      if (detail) return detail;
    } catch {
      // fall through to the generic fallback message
    }
    return uploadErrorFallback();
  }

  return (
    readDetail(errObj.json) ??
    readDetail(errObj.body) ??
    (typeof errObj.message === 'string' && errObj.message
      ? errObj.message
      : undefined) ??
    uploadErrorFallback()
  );
}

function FileUploader({ addSuccessToast, addDangerToast }: ToastProps) {
  const user = useSelector((state: RootState) => state.user);
  const hasView = canView(user);

  const [files, setFiles] = useState<StorageFile[]>([]);
  const [error, setError] = useState(false);
  const [loading, setLoading] = useState(false);

  const [uploadOpen, setUploadOpen] = useState(false);
  const [uploadFileList, setUploadFileList] = useState<UploadFile[]>([]);
  const [uploading, setUploading] = useState(false);
  const [uploadName, setUploadName] = useState('');
  const [uploadCategory, setUploadCategory] = useState('');
  const [uploadFolder, setUploadFolder] = useState('');
  const [uploadTags, setUploadTags] = useState('');
  const [uploadError, setUploadError] = useState<string | null>(null);

  const [editState, setEditState] = useState<EditState | null>(null);
  const [saving, setSaving] = useState(false);

  const [deleteTarget, setDeleteTarget] = useState<StorageFile | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const [previewTarget, setPreviewTarget] = useState<StorageFile | null>(
    null,
  );

  const loadFiles = useCallback(async () => {
    setLoading(true);
    setError(false);
    try {
      const result = await fetchFiles();
      setFiles(result);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (hasView) {
      loadFiles();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasView]);

  const closeUploadModal = () => {
    setUploadOpen(false);
    setUploadFileList([]);
    setUploadName('');
    setUploadCategory('');
    setUploadFolder('');
    setUploadTags('');
    setUploadError(null);
  };

  const onUpload = async () => {
    const fileToUpload = uploadFileList[0]?.originFileObj;
    if (!fileToUpload || !uploadName || !uploadCategory) {
      return;
    }
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append('file', fileToUpload);
      formData.append('name', uploadName);
      formData.append('category', uploadCategory);
      if (uploadFolder) {
        formData.append('folder', uploadFolder);
      }
      if (uploadTags) {
        formData.append('tags', uploadTags);
      }
      await uploadFile(formData);
      setUploadError(null);
      closeUploadModal();
      await loadFiles();
    } catch (err) {
      const message = await extractErrorMessage(err);
      setUploadError(message);
    } finally {
      setUploading(false);
    }
  };

  const openEditModal = (file: StorageFile) => {
    setEditState({
      uuid: file.uuid,
      name: file.name ?? file.file_name,
      folder: file.folder ?? '',
      tags: (file.tags ?? []).join(', '),
    });
  };

  const onSaveEdit = async () => {
    if (!editState) {
      return;
    }
    setSaving(true);
    try {
      const tags = editState.tags
        .split(',')
        .map(tag => tag.trim())
        .filter(Boolean);
      await updateFile(editState.uuid, {
        name: editState.name,
        folder: editState.folder,
        tags,
      });
      setEditState(null);
      await loadFiles();
    } finally {
      setSaving(false);
    }
  };

  const onConfirmDelete = async () => {
    if (!deleteTarget) {
      return;
    }
    try {
      await deleteFile(deleteTarget.uuid);
      setDeleteError(null);
      setDeleteTarget(null);
      await loadFiles();
    } catch (err) {
      const message = await extractErrorMessage(err);
      setDeleteError(message);
    }
  };

  if (!hasView) {
    return (
      <div data-test="file-uploader-page">
        <SubMenu name={t('Files')} />
        <StyledContent>
          <Alert type="error" closable={false}>
            {t("You don't have permission to view this page.")}
          </Alert>
        </StyledContent>
      </div>
    );
  }

  const columns: ColumnsType<StorageFile> = [
    {
      title: t('Name'),
      dataIndex: 'name',
      key: 'name',
      render: (value: string, file: StorageFile) => value ?? file.file_name,
    },
    {
      title: t('File name'),
      dataIndex: 'file_name',
      key: 'file_name',
    },
    {
      title: t('Category'),
      dataIndex: 'category',
      key: 'category',
      render: (value: string) => value ?? '',
    },
    {
      title: t('Folder'),
      dataIndex: 'folder',
      key: 'folder',
      render: (value: string) => value ?? '',
    },
    {
      title: t('Tags'),
      dataIndex: 'tags',
      key: 'tags',
      render: (value: string[]) => (value ?? []).join(', '),
    },
  ];

  // This component already returns early above when `!hasView`, so every
  // row reaching this point belongs to a user who can view - the preview
  // action is therefore always rendered alongside edit/delete.
  columns.push({
    title: t('Actions'),
    key: 'actions',
    render: (_: unknown, file: StorageFile) => (
      <StyledActions className="actions">
        <Tooltip id="copy-uuid-action-tooltip" title={t('Copy UUID')}>
          <span
            data-test={`copy-uuid-${file.uuid}`}
            role="button"
            tabIndex={0}
            className="action-button"
            onClick={() => {
              copyTextToClipboard(() => Promise.resolve(file.uuid))
                .then(() => addSuccessToast(t('UUID copied to clipboard')))
                .catch(() => addDangerToast(t('Could not copy UUID')));
            }}
          >
            <Icons.CopyOutlined iconSize="l" />
          </span>
        </Tooltip>
        <Tooltip id="preview-action-tooltip" title={t('Preview')}>
          <span
            data-test={`preview-file-${file.uuid}`}
            role="button"
            tabIndex={0}
            className="action-button"
            onClick={() => setPreviewTarget(file)}
          >
            <Icons.EyeOutlined iconSize="l" />
          </span>
        </Tooltip>
        {canEdit(user) && (
          <Tooltip id="edit-action-tooltip" title={t('Edit')}>
            <span
              data-test={`edit-file-${file.uuid}`}
              role="button"
              tabIndex={0}
              className="action-button"
              onClick={() => openEditModal(file)}
            >
              <Icons.EditOutlined iconSize="l" />
            </span>
          </Tooltip>
        )}
        {canDelete(user) && (
          <Tooltip id="delete-action-tooltip" title={t('Delete')}>
            <span
              data-test={`delete-file-${file.uuid}`}
              role="button"
              tabIndex={0}
              className="action-button"
              onClick={() => setDeleteTarget(file)}
            >
              <Icons.DeleteOutlined iconSize="l" />
            </span>
          </Tooltip>
        )}
      </StyledActions>
    ),
  });

  return (
    <div data-test="file-uploader-page">
      <SubMenu name={t('Files')} />
      <StyledContent>
        {error && (
          <Alert
            type="error"
            closable={false}
            description={
              <Button
                data-test="retry-btn"
                buttonStyle="link"
                onClick={loadFiles}
              >
                {t('Retry')}
              </Button>
            }
          >
            {t(
              'File storage is currently unavailable. Please try again later.',
            )}
          </Alert>
        )}
        {canUpload(user) && !error && (
          <StyledToolbar>
            <Button
              data-test="upload-btn"
              buttonStyle="primary"
              onClick={() => setUploadOpen(true)}
            >
              {t('Upload')}
            </Button>
          </StyledToolbar>
        )}
        {!error && (
          <Table<StorageFile>
            rowKey="uuid"
            columns={columns}
            data={files}
            loading={loading}
          />
        )}
      </StyledContent>
      {uploadOpen && (
        <Modal
          name="upload-file"
          show={uploadOpen}
          title={t('Upload file')}
          onHide={closeUploadModal}
          onHandledPrimaryAction={onUpload}
          primaryButtonName={t('Upload')}
          disablePrimaryButton={
            uploadFileList.length === 0 ||
            !uploadName ||
            !uploadCategory ||
            uploading
          }
        >
          {uploadError && (
            <Alert
              type="error"
              closable={false}
              data-test="upload-error-alert"
              description={uploadError}
            />
          )}
          <Upload
            data-test="upload-file-input"
            fileList={uploadFileList}
            onChange={({ fileList }) => {
              setUploadFileList(fileList);
              setUploadError(null);
              const selected = fileList[0];
              if (selected && !uploadName) {
                setUploadName(selected.name);
              }
            }}
            onRemove={() => {
              setUploadFileList([]);
              setUploadError(null);
            }}
            customRequest={() => {}}
            maxCount={1}
          >
            <Button loading={uploading}>{t('Select file')}</Button>
          </Upload>
          <FormLabel htmlFor="upload-name">{t('Name')}</FormLabel>
          <Input
            data-test="upload-name-input"
            id="upload-name"
            value={uploadName}
            onChange={e => setUploadName(e.target.value)}
          />
          <FormLabel htmlFor="upload-category">{t('Category')}</FormLabel>
          <Select
            ariaLabel={t('Category')}
            data-test="upload-category-select"
            placeholder={t('Select a category')}
            value={uploadCategory || undefined}
            onChange={value => {
              setUploadCategory(value as string);
              setUploadError(null);
            }}
            options={UPLOAD_CATEGORY_OPTIONS}
            getPopupContainer={() => document.body}
          />
          <FormLabel htmlFor="upload-folder">{t('Folder')}</FormLabel>
          <Input
            data-test="upload-folder-input"
            id="upload-folder"
            value={uploadFolder}
            onChange={e => setUploadFolder(e.target.value)}
          />
          <FormLabel htmlFor="upload-tags">{t('Tags')}</FormLabel>
          <Input
            data-test="upload-tags-input"
            id="upload-tags"
            value={uploadTags}
            onChange={e => setUploadTags(e.target.value)}
          />
        </Modal>
      )}
      {editState && (
        <Modal
          name="edit-file"
          show={!!editState}
          title={t('Edit file')}
          onHide={() => setEditState(null)}
          onHandledPrimaryAction={onSaveEdit}
          primaryButtonName={t('Save')}
          disablePrimaryButton={saving}
        >
          <FormLabel htmlFor="file_name">{t('Name')}</FormLabel>
          <Input
            data-test="edit-file-name-input"
            id="file_name"
            value={editState.name}
            onChange={e => setEditState({ ...editState, name: e.target.value })}
          />
          <FormLabel htmlFor="edit-folder">{t('Folder')}</FormLabel>
          <Input
            data-test="edit-folder-input"
            id="edit-folder"
            value={editState.folder}
            onChange={e =>
              setEditState({ ...editState, folder: e.target.value })
            }
          />
          <FormLabel htmlFor="edit-tags">{t('Tags')}</FormLabel>
          <Input
            data-test="edit-tags-input"
            id="edit-tags"
            value={editState.tags}
            onChange={e => setEditState({ ...editState, tags: e.target.value })}
          />
        </Modal>
      )}
      {deleteTarget && (
        <DeleteModal
          open={!!deleteTarget}
          onHide={() => {
            setDeleteError(null);
            setDeleteTarget(null);
          }}
          onConfirm={onConfirmDelete}
          title={t('Delete file')}
          description={
            <>
              {deleteError && (
                <Alert
                  type="error"
                  closable={false}
                  data-test="delete-error-alert"
                  description={deleteError}
                />
              )}
              {t(
                'Are you sure you want to delete %s?',
                deleteTarget.name ?? deleteTarget.file_name,
              )}
            </>
          }
        />
      )}
      {previewTarget && (
        <Modal
          name="preview-file"
          show={!!previewTarget}
          title={t('Preview: %s', previewTarget.name ?? previewTarget.file_name)}
          onHide={() => setPreviewTarget(null)}
          hideFooter
        >
          {isImageLike(previewTarget) ? (
            <div
              style={{
                display: 'flex',
                justifyContent: 'center',
                alignItems: 'center',
                width: '100%',
                height: '70vh',
              }}
            >
              <img
                data-test="preview-file-image"
                src={fileContentUrl(previewTarget.uuid)}
                alt={previewTarget.name ?? previewTarget.file_name}
                style={{
                  width: '100%',
                  height: '100%',
                  objectFit: 'contain',
                }}
              />
            </div>
          ) : (
            <>
              <p>
                {t(
                  'This file type does not support preview (%s).',
                  previewTarget.content_type ??
                    previewTarget.category ??
                    t('unknown type'),
                )}
              </p>
              <Button
                data-test="preview-file-open-link"
                buttonStyle="link"
                onClick={() =>
                  window.open(
                    fileContentUrl(previewTarget.uuid),
                    '_blank',
                    'noopener,noreferrer',
                  )
                }
              >
                {t('Open file')}
              </Button>
            </>
          )}
        </Modal>
      )}
    </div>
  );
}

export default withToasts(FileUploader);
