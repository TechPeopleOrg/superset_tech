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
import { dataUrlToBlob, saveReport, fetchReports } from './api';

// 1x1 transparent PNG.
const PNG_DATA_URL =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=';

test('dataUrlToBlob keeps the declared mime type', () => {
  const blob = dataUrlToBlob(PNG_DATA_URL);
  expect(blob.type).toBe('image/png');
  expect(blob.size).toBeGreaterThan(0);
});

test('dataUrlToBlob rejects a malformed data URL', () => {
  expect(() => dataUrlToBlob('not-a-data-url')).toThrow('Malformed data URL');
});

test('saveReport posts the snapshot with description and date in metadata', async () => {
  const post = jest
    .spyOn(SupersetClient, 'post')
    .mockResolvedValue({} as never);

  await saveReport({
    dataUrl: PNG_DATA_URL,
    fileName: 'leak-2026-09-05.png',
    name: 'Leak at node A-12',
    description: 'Water ingress, not matching the schedule',
    problemDate: '2026-09-05',
    source: { type: 'dashboard', id: 10, name: 'Construction progress' },
  });

  const { endpoint, postPayload } = post.mock.calls[0][0] as {
    endpoint: string;
    postPayload: FormData;
  };
  expect(endpoint).toBe('/storagereports/api/files');
  expect(postPayload.get('category')).toBe('report');
  expect(postPayload.get('name')).toBe('Leak at node A-12');
  expect(JSON.parse(postPayload.get('metadata') as string)).toEqual({
    description: 'Water ingress, not matching the schedule',
    problem_date: '2026-09-05',
    source_type: 'dashboard',
    source_name: 'Construction progress',
    source_id: 10,
  });
  post.mockRestore();
});

test('saveReport never sends an author; the server stamps it', async () => {
  const post = jest
    .spyOn(SupersetClient, 'post')
    .mockResolvedValue({} as never);

  await saveReport({
    dataUrl: PNG_DATA_URL,
    fileName: 'r.png',
    name: 'r',
    description: 'd',
    problemDate: '2026-09-05',
    source: { type: 'chart', name: 'Chart' },
  });

  const { postPayload } = post.mock.calls[0][0] as { postPayload: FormData };
  expect(
    JSON.parse(postPayload.get('metadata') as string).author,
  ).toBeUndefined();
  post.mockRestore();
});

test('fetchReports tolerates both a bare array and an envelope', async () => {
  const get = jest
    .spyOn(SupersetClient, 'get')
    .mockResolvedValueOnce({ json: [{ uuid: 'a' }] } as never)
    .mockResolvedValueOnce({ json: { items: [{ uuid: 'b' }] } } as never);

  expect(await fetchReports()).toEqual([{ uuid: 'a' }]);
  expect(await fetchReports()).toEqual([{ uuid: 'b' }]);
  get.mockRestore();
});

test('saveReport omits the assignee when no one is picked', async () => {
  const post = jest
    .spyOn(SupersetClient, 'post')
    .mockResolvedValue({} as never);

  await saveReport({
    dataUrl: PNG_DATA_URL,
    fileName: 'r.png',
    name: 'r',
    description: 'd',
    problemDate: '2026-09-05',
    source: { type: 'dashboard', id: 1, name: 'D' },
  });

  const { postPayload } = post.mock.calls[0][0] as { postPayload: FormData };
  const metadata = JSON.parse(postPayload.get('metadata') as string);
  // Absent rather than an empty string, so the log can tell "unassigned" apart.
  expect(metadata).not.toHaveProperty('assignee');
  expect(metadata).not.toHaveProperty('assignee_id');
  post.mockRestore();
});

test('saveReport records the picked assignee by name and id', async () => {
  const post = jest
    .spyOn(SupersetClient, 'post')
    .mockResolvedValue({} as never);

  await saveReport({
    dataUrl: PNG_DATA_URL,
    fileName: 'r.png',
    name: 'r',
    description: 'd',
    problemDate: '2026-09-05',
    source: { type: 'dashboard', id: 1, name: 'D' },
    assignee: { value: 7, label: 'Иван Петров' },
  });

  const { postPayload } = post.mock.calls[0][0] as { postPayload: FormData };
  const metadata = JSON.parse(postPayload.get('metadata') as string);
  expect(metadata.assignee).toBe('Иван Петров');
  expect(metadata.assignee_id).toBe(7);
  post.mockRestore();
});
