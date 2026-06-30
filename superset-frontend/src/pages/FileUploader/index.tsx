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
import {
  Button,
  DeleteModal,
  FormLabel,
  Input,
  Modal,
  Select,
  Table,
  Upload,
  type ColumnsType,
  type UploadFile,
} from '@superset-ui/core/components';
import { RootState } from 'src/dashboard/types';
import { canView, canUpload, canEdit, canDelete } from './permissions';
import {
  StorageFile,
  fetchFiles,
  uploadFile,
  updateFile,
  deleteFile,
} from './api';

interface EditState {
  id: string;
  file_name: string;
  category: string;
}

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

export default function FileUploader() {
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
      id: file.id,
      file_name: file.file_name,
      category: file.category ?? '',
    });
  };

  const onSaveEdit = async () => {
    if (!editState) {
      return;
    }
    setSaving(true);
    try {
      await updateFile(editState.id, {
        file_name: editState.file_name,
        category: editState.category,
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
    await deleteFile(deleteTarget.id);
    setDeleteTarget(null);
    await loadFiles();
  };

  if (!hasView) {
    return (
      <div data-test="file-uploader-page">
        <h1>{t('Files')}</h1>
        <Alert type="error" closable={false}>
          {t("You don't have permission to view this page.")}
        </Alert>
      </div>
    );
  }

  const columns: ColumnsType<StorageFile> = [
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
  ];

  if (canEdit(user) || canDelete(user)) {
    columns.push({
      title: t('Actions'),
      key: 'actions',
      render: (_: unknown, file: StorageFile) => (
        <>
          {canEdit(user) && (
            <Button
              data-test={`edit-file-${file.id}`}
              buttonStyle="link"
              onClick={() => openEditModal(file)}
            >
              {t('Edit')}
            </Button>
          )}
          {canDelete(user) && (
            <Button
              data-test={`delete-file-${file.id}`}
              buttonStyle="link"
              onClick={() => setDeleteTarget(file)}
            >
              {t('Delete')}
            </Button>
          )}
        </>
      ),
    });
  }

  return (
    <div data-test="file-uploader-page">
      <h1>{t('Files')}</h1>
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
          {t('File storage is currently unavailable. Please try again later.')}
        </Alert>
      )}
      {canUpload(user) && (
        <Button
          data-test="upload-btn"
          buttonStyle="primary"
          onClick={() => setUploadOpen(true)}
        >
          {t('Upload')}
        </Button>
      )}
      {!error && (
        <Table<StorageFile>
          rowKey="id"
          columns={columns}
          data={files}
          loading={loading}
        />
      )}
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
          <FormLabel htmlFor="file_name">{t('File name')}</FormLabel>
          <Input
            data-test="edit-file-name-input"
            id="file_name"
            value={editState.file_name}
            onChange={e =>
              setEditState({ ...editState, file_name: e.target.value })
            }
          />
          <FormLabel htmlFor="category">{t('Category')}</FormLabel>
          <Input
            data-test="edit-category-input"
            id="category"
            value={editState.category}
            onChange={e =>
              setEditState({ ...editState, category: e.target.value })
            }
          />
        </Modal>
      )}
      {deleteTarget && (
        <DeleteModal
          open={!!deleteTarget}
          onHide={() => setDeleteTarget(null)}
          onConfirm={onConfirmDelete}
          title={t('Delete file')}
          description={t(
            'Are you sure you want to delete %s?',
            deleteTarget.file_name,
          )}
        />
      )}
    </div>
  );
}
