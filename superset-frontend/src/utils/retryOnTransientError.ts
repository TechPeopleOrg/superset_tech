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

import { getClientErrorObject } from '@superset-ui/core';

// Substrings that identify a *transient* backend failure: a request that is
// likely to succeed if retried, rather than a genuine validation error.
//
// `deque mutated during iteration` (and the broader `mutated during iteration`)
// is a Python RuntimeError raised when concurrent chart-data requests race over
// a shared, cached datasource object under a multi-threaded gunicorn worker. It
// is surfaced to the client as an HTTP 400 (see ChartDataQueryFailedError), but
// it is non-deterministic and a retry almost always succeeds. The same race
// affects both native filters and regular dashboard charts, so this helper is
// shared by the common chart-data request path.
const TRANSIENT_ERROR_SUBSTRINGS = [
  'mutated during iteration',
  'network error',
  'failed to fetch',
];

export interface RetryOptions {
  retries?: number;
  delayMs?: number;
}

const DEFAULT_RETRIES = 2;
const DEFAULT_DELAY_MS = 350;

const delay = (ms: number) =>
  new Promise<void>(resolve => {
    setTimeout(resolve, ms);
  });

/**
 * Determine whether a rejected chart-data request represents a transient
 * failure that is worth retrying (a backend race condition or a dropped
 * connection) as opposed to a genuine, deterministic error.
 */
export async function isTransientChartDataError(
  error: unknown,
): Promise<boolean> {
  if (
    error instanceof TypeError &&
    error.message.toLowerCase().includes('failed to fetch')
  ) {
    return true;
  }

  try {
    const clientError = await getClientErrorObject(
      error as Parameters<typeof getClientErrorObject>[0],
    );
    const haystack = [
      clientError.error,
      clientError.message,
      ...(clientError.errors?.map(e => e.message) ?? []),
    ]
      .filter((value): value is string => typeof value === 'string')
      .join(' ')
      .toLowerCase();

    return TRANSIENT_ERROR_SUBSTRINGS.some(substring =>
      haystack.includes(substring),
    );
  } catch {
    return false;
  }
}

/**
 * Run an async operation and retry it when it fails with a transient error.
 * Non-transient errors are rethrown immediately without retrying.
 */
export async function retryOnTransientError<T>(
  operation: () => Promise<T>,
  { retries = DEFAULT_RETRIES, delayMs = DEFAULT_DELAY_MS }: RetryOptions = {},
): Promise<T> {
  let lastError: unknown;
  for (let attempt = 0; attempt <= retries; attempt += 1) {
    try {
      // eslint-disable-next-line no-await-in-loop
      return await operation();
    } catch (error) {
      lastError = error;
      // eslint-disable-next-line no-await-in-loop
      if (attempt === retries || !(await isTransientChartDataError(error))) {
        throw error;
      }
      if (delayMs > 0) {
        // eslint-disable-next-line no-await-in-loop
        await delay(delayMs);
      }
    }
  }
  throw lastError;
}
