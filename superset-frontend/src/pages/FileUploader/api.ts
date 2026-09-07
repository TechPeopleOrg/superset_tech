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

export interface StorageFile {
  id: string;
  uuid: string;
  name: string;
  file_name: string;
  // 1 until the content is replaced; the uuid stays the same across versions.
  version?: number;
  // Who uploaded or last updated the file, stamped server-side.
  metadata?: { author?: string; [key: string]: unknown };
  // Touched on upload and on every content update.
  updated_at?: string;
  category?: string;
  folder?: string;
  tags?: string[];
  content_type?: string;
  [key: string]: unknown;
}

const BASE = '/fileuploader/api';

// Plain same-origin URL the browser can load directly to stream a file's
// bytes. The proxy is same-origin (uses the session cookie) and injects the
// storage service's API key server-side, so the browser must never hit a
// raw MinIO/presigned URL.
export const fileContentUrl = (id: string) => `${BASE}/files/${id}/content`;

// Trigger a browser download of a file's bytes. The proxy serves content with
// an `inline` Content-Disposition, so we force a download client-side via a
// temporary anchor with the `download` attribute (same-origin, so it honors
// the suggested filename).
export const downloadFile = (id: string, fileName: string): void => {
  const link = document.createElement('a');
  link.href = fileContentUrl(id);
  link.download = fileName;
  link.rel = 'noopener';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
};

interface FileListEnvelope {
  items?: StorageFile[];
}

export const fetchFiles = async (folder = ''): Promise<StorageFile[]> => {
  // Report snapshots live in the same storage but belong to the report log,
  // which has its own page; they are excluded server-side so they never eat
  // into this listing's page size.
  const params = new URLSearchParams({ exclude_category: 'report' });
  if (folder) {
    params.set('folder', folder);
  }
  const { json } = await SupersetClient.get({
    endpoint: `${BASE}/files?${params.toString()}`,
  });
  const list = Array.isArray(json)
    ? json
    : ((json as FileListEnvelope)?.items ?? []);
  return list as StorageFile[];
};

export const uploadFile = (formData: FormData) =>
  SupersetClient.post({ endpoint: `${BASE}/files`, postPayload: formData });

// Swap the bytes of an existing record. The record keeps its uuid, so links
// to it stay valid; the storage service bumps its version.
export const replaceFileContent = (id: string, file: File) => {
  const formData = new FormData();
  formData.append('file', file);
  // Empty on purpose: the proxy fills in the author, and the storage service
  // merges it into whatever the record already holds.
  formData.append('metadata', '{}');
  return SupersetClient.put({
    endpoint: `${BASE}/files/${id}/content`,
    postPayload: formData,
  });
};

export const updateFile = (id: string, meta: Record<string, unknown>) =>
  SupersetClient.request({
    method: 'PATCH',
    endpoint: `${BASE}/files/${id}`,
    jsonPayload: meta,
  });

// The storage service returns 204 No Content on delete (empty body), so we
// must not let SupersetClient try to JSON-parse the response - that would
// reject the promise on an otherwise-successful delete.
export const deleteFile = (id: string) =>
  SupersetClient.delete({ endpoint: `${BASE}/files/${id}`, parseMethod: null });
