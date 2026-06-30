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
import {
  Button,
  DeleteModal,
  FormLabel,
  Input,
  Modal,
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

export default function FileUploader() {
  const user = useSelector((state: RootState) => state.user);
  const hasView = canView(user);

  const [files, setFiles] = useState<StorageFile[]>([]);
  const [error, setError] = useState(false);
  const [loading, setLoading] = useState(false);

  const [uploadOpen, setUploadOpen] = useState(false);
  const [uploadFileList, setUploadFileList] = useState<UploadFile[]>([]);
  const [uploading, setUploading] = useState(false);

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
  };

  const onUpload = async () => {
    const fileToUpload = uploadFileList[0]?.originFileObj;
    if (!fileToUpload) {
      return;
    }
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append('file', fileToUpload);
      await uploadFile(formData);
      closeUploadModal();
      await loadFiles();
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
          disablePrimaryButton={uploadFileList.length === 0 || uploading}
        >
          <Upload
            data-test="upload-file-input"
            fileList={uploadFileList}
            onChange={({ fileList }) => setUploadFileList(fileList)}
            onRemove={() => setUploadFileList([])}
            customRequest={() => {}}
            maxCount={1}
          >
            <Button loading={uploading}>{t('Select file')}</Button>
          </Upload>
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
