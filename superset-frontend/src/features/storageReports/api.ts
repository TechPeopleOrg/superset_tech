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
import rison from 'rison';
import { SupersetClient } from '@superset-ui/core';

// Where a report snapshot came from, recorded so the log can link back.
export interface ReportSource {
  type: 'dashboard' | 'chart';
  id?: number;
  name: string;
}

// Metadata carried on a report file. The storage service keeps this as an
// opaque JSON blob; the shape lives here.
export interface ReportMetadata {
  description: string;
  // Date the problem was observed (YYYY-MM-DD), which may predate the upload.
  problem_date: string;
  source_type?: ReportSource['type'];
  source_id?: number;
  source_name?: string;
  // Stamped server-side from the session; never sent by the browser.
  author?: string;
  // Who is expected to act on the problem. Optional and empty by default —
  // a report can be filed before anyone is assigned to it.
  assignee?: string;
  assignee_id?: number;
}

export interface StorageReport {
  id: number;
  uuid: string;
  name: string;
  file_name: string;
  file_size?: number;
  content_type?: string;
  metadata?: Partial<ReportMetadata>;
  // Set by the storage service when the file was stored.
  created_at?: string;
  [key: string]: unknown;
}

const BASE = '/storagereports/api';

// Same-origin URL for a report's bytes. The proxy injects the storage API key
// server-side and refuses non-report files, so the browser never touches the
// object store directly.
export const reportContentUrl = (ref: string | number) =>
  `${BASE}/files/${ref}/content`;

/**
 * Convert a data URL produced by the image capture into a Blob.
 *
 * Kept synchronous (rather than `fetch(dataUrl).blob()`) so it works under the
 * jsdom test environment, where fetch does not handle data: URLs.
 */
export const dataUrlToBlob = (dataUrl: string): Blob => {
  const [header, encoded] = dataUrl.split(',');
  if (encoded === undefined) {
    throw new Error('Malformed data URL');
  }
  const mimeMatch = /data:([^;]+)/.exec(header);
  const mime = mimeMatch ? mimeMatch[1] : 'application/octet-stream';
  const binary = atob(encoded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return new Blob([bytes], { type: mime });
};

export interface SaveReportArgs {
  dataUrl: string;
  fileName: string;
  // Report title shown in the log.
  name: string;
  description: string;
  problemDate: string;
  source: ReportSource;
  // Optional: no one is assigned unless the user picks someone.
  assignee?: { value: number; label: string } | null;
}

export const saveReport = ({
  dataUrl,
  fileName,
  name,
  description,
  problemDate,
  source,
  assignee,
}: SaveReportArgs) => {
  const metadata: ReportMetadata = {
    description,
    problem_date: problemDate,
    source_type: source.type,
    source_name: source.name,
    ...(source.id === undefined ? {} : { source_id: source.id }),
    ...(assignee
      ? { assignee: assignee.label, assignee_id: assignee.value }
      : {}),
  };
  const formData = new FormData();
  formData.append('file', dataUrlToBlob(dataUrl), fileName);
  formData.append('name', name);
  // The proxy pins the category to `report`; sent for completeness.
  formData.append('category', 'report');
  formData.append('folder', '/');
  formData.append('metadata', JSON.stringify(metadata));
  return SupersetClient.post({
    endpoint: `${BASE}/files`,
    postPayload: formData,
  });
};

interface ReportListEnvelope {
  items?: StorageReport[];
}

export const fetchReports = async (): Promise<StorageReport[]> => {
  const { json } = await SupersetClient.get({
    endpoint: `${BASE}/files?limit=200`,
  });
  const list = Array.isArray(json)
    ? json
    : ((json as ReportListEnvelope)?.items ?? []);
  return list as StorageReport[];
};

// Edit a report's title or metadata in place. Only the fields passed are sent.
export const updateReport = (
  ref: string | number,
  fields: { name?: string; metadata?: Partial<ReportMetadata> },
) =>
  SupersetClient.request({
    method: 'PATCH',
    endpoint: `${BASE}/files/${ref}`,
    jsonPayload: fields,
  });

// The storage service answers 204 with an empty body, which SupersetClient
// would fail to JSON-parse; parseMethod null keeps a successful delete
// successful.
export const deleteReport = (ref: string | number) =>
  SupersetClient.delete({
    endpoint: `${BASE}/files/${ref}`,
    parseMethod: null,
  });

/**
 * Options for the "assigned to" picker, paged and searchable.
 *
 * Uses the dashboard `related/owners` endpoint rather than the security users
 * API: it returns the same people and is readable by any user who can open a
 * dashboard, so the picker works without granting user-admin permissions.
 */
export const loadAssigneeOptions = (
  input = '',
  page: number,
  pageSize: number,
) => {
  const query = rison.encode({ filter: input, page, page_size: pageSize });
  return SupersetClient.get({
    endpoint: `/api/v1/dashboard/related/owners?q=${query}`,
  }).then(response => ({
    data: response.json.result.map((item: { value: number; text: string }) => ({
      value: item.value,
      label: item.text,
    })),
    totalCount: response.json.count,
  }));
};
