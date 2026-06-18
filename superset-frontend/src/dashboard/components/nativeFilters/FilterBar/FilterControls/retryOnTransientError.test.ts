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
  isTransientFilterError,
  retryOnTransientError,
} from './retryOnTransientError';

test('isTransientFilterError detects backend race condition (deque mutated during iteration)', () => {
  const response = new Response(
    JSON.stringify({ message: 'Error: deque mutated during iteration' }),
    { status: 400 },
  );
  return expect(isTransientFilterError(response)).resolves.toBe(true);
});

test('isTransientFilterError detects network failures (Failed to fetch)', () => {
  const error = new TypeError('Failed to fetch');
  return expect(isTransientFilterError(error)).resolves.toBe(true);
});

test('isTransientFilterError treats a normal validation 400 as non-transient', () => {
  const response = new Response(
    JSON.stringify({ message: 'Time column is required' }),
    { status: 400 },
  );
  return expect(isTransientFilterError(response)).resolves.toBe(false);
});

test('retryOnTransientError retries the request when it fails with a transient error', async () => {
  let attempts = 0;
  const operation = jest.fn(async () => {
    attempts += 1;
    if (attempts < 3) {
      throw new TypeError('Failed to fetch');
    }
    return 'success';
  });

  const result = await retryOnTransientError(operation, {
    retries: 3,
    delayMs: 0,
  });

  expect(result).toBe('success');
  expect(operation).toHaveBeenCalledTimes(3);
});

test('retryOnTransientError gives up after exhausting retries and rethrows', async () => {
  const error = new TypeError('Failed to fetch');
  const operation = jest.fn(async () => {
    throw error;
  });

  await expect(
    retryOnTransientError(operation, { retries: 2, delayMs: 0 }),
  ).rejects.toBe(error);
  // initial attempt + 2 retries
  expect(operation).toHaveBeenCalledTimes(3);
});

test('retryOnTransientError does not retry a non-transient error', async () => {
  const response = new Response(
    JSON.stringify({ message: 'Time column is required' }),
    { status: 400 },
  );
  const operation = jest.fn(async () => {
    throw response;
  });

  await expect(
    retryOnTransientError(operation, { retries: 3, delayMs: 0 }),
  ).rejects.toBe(response);
  expect(operation).toHaveBeenCalledTimes(1);
});
