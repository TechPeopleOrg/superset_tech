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

import { createOpenClawApi, OpenClawError } from './OpenClawApi';

function jsonResponse(body: unknown, ok = true, status = 200) {
  return {
    ok,
    status,
    json: async () => body,
  } as unknown as Response;
}

test('posts to /v1/chat/completions with bearer key and returns message', async () => {
  const fetchImpl = jest.fn().mockResolvedValue(
    jsonResponse({
      choices: [{ message: { role: 'assistant', content: 'hi' } }],
    }),
  );
  const call = createOpenClawApi({
    baseUrl: 'https://oc/openclaw/',
    apiKey: 'k',
    fetchImpl,
  });
  const msg = await call({
    messages: [{ role: 'user', content: 'hello' }],
    model: 'openclaw/data-analyst',
    temperature: 1,
  });
  expect(msg.content).toBe('hi');
  const [url, init] = fetchImpl.mock.calls[0];
  expect(url).toBe('https://oc/openclaw/v1/chat/completions');
  expect((init.headers as Record<string, string>).Authorization).toBe('Bearer k');
  expect(JSON.parse(init.body as string).stream).toBe(false);
});

test('passes tools and returns tool_calls', async () => {
  const fetchImpl = jest.fn().mockResolvedValue(
    jsonResponse({
      choices: [
        {
          message: {
            role: 'assistant',
            content: null,
            tool_calls: [
              { id: 'c1', type: 'function', function: { name: 't', arguments: '{}' } },
            ],
          },
        },
      ],
    }),
  );
  const call = createOpenClawApi({ baseUrl: 'https://oc/', apiKey: 'k', fetchImpl });
  const msg = await call({
    messages: [],
    tools: [{ type: 'function', function: { name: 't', parameters: {} } }],
    model: 'm',
    temperature: 0,
  });
  expect(msg.tool_calls?.[0].function.name).toBe('t');
  expect(JSON.parse(fetchImpl.mock.calls[0][1].body as string).tools).toHaveLength(1);
});

test('throws OpenClawError with server message on non-ok', async () => {
  const fetchImpl = jest
    .fn()
    .mockResolvedValue(jsonResponse({ error: { message: 'bad key' } }, false, 401));
  const call = createOpenClawApi({ baseUrl: 'https://oc/', apiKey: 'k', fetchImpl });
  await expect(
    call({ messages: [], model: 'm', temperature: 0 }),
  ).rejects.toThrow('bad key');
  await expect(
    call({ messages: [], model: 'm', temperature: 0 }),
  ).rejects.toBeInstanceOf(OpenClawError);
});
