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
import { renderHook, waitFor } from '@testing-library/react';
import { useSvgSource } from '../src/useSvgSource';

const okResponse = (body: string) =>
  ({ ok: true, status: 200, text: () => Promise.resolve(body) }) as Response;

let fetchMock: jest.Mock;

beforeEach(() => {
  fetchMock = jest.fn().mockResolvedValue(okResponse('<svg id="a" />'));
  global.fetch = fetchMock as unknown as typeof fetch;
});

afterEach(() => {
  jest.resetAllMocks();
});

test('fetches the markup for the given uuid', async () => {
  const { result } = renderHook(() => useSvgSource('abc-123'));

  await waitFor(() => expect(result.current.svg).toBe('<svg id="a" />'));
  expect(fetchMock).toHaveBeenCalledWith(
    '/fileuploader/api/files/abc-123/content',
    expect.objectContaining({ signal: expect.anything() }),
  );
  expect(result.current.loading).toBe(false);
  expect(result.current.error).toBeUndefined();
});

test('reports loading while the request is in flight', async () => {
  let resolveFetch: (value: Response) => void = () => {};
  fetchMock.mockImplementation(
    () =>
      new Promise<Response>(resolve => {
        resolveFetch = resolve;
      }),
  );

  const { result } = renderHook(() => useSvgSource('abc-123'));
  expect(result.current.loading).toBe(true);

  resolveFetch(okResponse('<svg />'));
  await waitFor(() => expect(result.current.loading).toBe(false));
});

test('does not fetch when the uuid is empty', () => {
  const { result } = renderHook(() => useSvgSource(''));

  expect(fetchMock).not.toHaveBeenCalled();
  expect(result.current.svg).toBe('');
  expect(result.current.loading).toBe(false);
});

test('surfaces an error for a failed response', async () => {
  fetchMock.mockResolvedValue({ ok: false, status: 404 } as Response);

  const { result } = renderHook(() => useSvgSource('missing'));

  await waitFor(() => expect(result.current.error).toBeDefined());
  expect(result.current.svg).toBe('');
  expect(result.current.loading).toBe(false);
});

test('surfaces an error when the request throws', async () => {
  fetchMock.mockRejectedValue(new Error('network down'));

  const { result } = renderHook(() => useSvgSource('abc-123'));

  await waitFor(() => expect(result.current.error).toBeDefined());
  expect(result.current.loading).toBe(false);
});

test('refetches when the uuid changes, without caching', async () => {
  fetchMock
    .mockResolvedValueOnce(okResponse('<svg id="first" />'))
    .mockResolvedValueOnce(okResponse('<svg id="second" />'))
    .mockResolvedValueOnce(okResponse('<svg id="first-again" />'));

  const { result, rerender } = renderHook(({ id }) => useSvgSource(id), {
    initialProps: { id: 'first' },
  });
  await waitFor(() => expect(result.current.svg).toBe('<svg id="first" />'));

  rerender({ id: 'second' });
  await waitFor(() => expect(result.current.svg).toBe('<svg id="second" />'));

  // Returning to a previously loaded uuid must hit the network again.
  rerender({ id: 'first' });
  await waitFor(() =>
    expect(result.current.svg).toBe('<svg id="first-again" />'),
  );
  expect(fetchMock).toHaveBeenCalledTimes(3);
});

test('aborts the previous request when the uuid changes', async () => {
  const signals: AbortSignal[] = [];
  fetchMock.mockImplementation((_url: string, init: RequestInit) => {
    signals.push(init.signal as AbortSignal);
    return new Promise<Response>(() => {});
  });

  const { rerender } = renderHook(({ id }) => useSvgSource(id), {
    initialProps: { id: 'first' },
  });
  rerender({ id: 'second' });

  await waitFor(() => expect(signals[0].aborted).toBe(true));
  expect(signals[1].aborted).toBe(false);
});

test('a late response from an aborted request does not overwrite the current markup', async () => {
  let resolveSlow: (value: Response) => void = () => {};
  fetchMock
    .mockImplementationOnce(
      () =>
        new Promise<Response>(resolve => {
          resolveSlow = resolve;
        }),
    )
    .mockResolvedValueOnce(okResponse('<svg id="second" />'));

  const { result, rerender } = renderHook(({ id }) => useSvgSource(id), {
    initialProps: { id: 'first' },
  });
  rerender({ id: 'second' });
  await waitFor(() => expect(result.current.svg).toBe('<svg id="second" />'));

  resolveSlow(okResponse('<svg id="stale" />'));
  await waitFor(() => expect(result.current.svg).toBe('<svg id="second" />'));
});

test('clears the markup when the uuid becomes empty', async () => {
  const { result, rerender } = renderHook(({ id }) => useSvgSource(id), {
    initialProps: { id: 'abc-123' },
  });
  await waitFor(() => expect(result.current.svg).toBe('<svg id="a" />'));

  rerender({ id: '' });
  await waitFor(() => expect(result.current.svg).toBe(''));
});

test('returning to a previous uuid shows loading, not the stale markup', async () => {
  let resolveThird: (value: Response) => void = () => {};
  fetchMock
    .mockResolvedValueOnce(okResponse('<svg id="first" />'))
    .mockResolvedValueOnce(okResponse('<svg id="second" />'))
    .mockImplementationOnce(
      () =>
        new Promise<Response>(resolve => {
          resolveThird = resolve;
        }),
    );

  const { result, rerender } = renderHook(({ id }) => useSvgSource(id), {
    initialProps: { id: 'first' },
  });
  await waitFor(() => expect(result.current.svg).toBe('<svg id="first" />'));

  rerender({ id: 'second' });
  await waitFor(() => expect(result.current.svg).toBe('<svg id="second" />'));

  // Back to 'first': the old markup must not reappear while the refetch runs.
  rerender({ id: 'first' });
  expect(result.current.loading).toBe(true);
  expect(result.current.svg).toBe('');

  resolveThird(okResponse('<svg id="first-again" />'));
  await waitFor(() =>
    expect(result.current.svg).toBe('<svg id="first-again" />'),
  );
});
