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
  file_name: string;
  category?: string;
  [key: string]: unknown;
}

const BASE = '/fileuploader/api';

export const fetchFiles = async (folder = ''): Promise<StorageFile[]> => {
  const { json } = await SupersetClient.get({
    endpoint: `${BASE}/files${folder ? `?folder=${encodeURIComponent(folder)}` : ''}`,
  });
  return Array.isArray(json) ? (json as StorageFile[]) : [];
};

export const uploadFile = (formData: FormData) =>
  SupersetClient.post({ endpoint: `${BASE}/files`, postPayload: formData });

export const updateFile = (id: string, meta: Record<string, unknown>) =>
  SupersetClient.request({
    method: 'PATCH',
    endpoint: `${BASE}/files/${id}`,
    jsonPayload: meta,
  });

export const deleteFile = (id: string) =>
  SupersetClient.delete({ endpoint: `${BASE}/files/${id}` });
