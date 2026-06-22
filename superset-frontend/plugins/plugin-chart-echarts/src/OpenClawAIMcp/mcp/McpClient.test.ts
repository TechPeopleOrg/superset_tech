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

import { McpClient, McpError } from './McpClient';

function jsonResponse(body: unknown, headers: Record<string, string> = {}) {
  return {
    ok: true,
    status: 200,
    headers: { get: (k: string) => headers[k.toLowerCase()] ?? null },
    text: async () => JSON.stringify(body),
  } as unknown as Response;
}

test('initialize stores session id from response header', async () => {
  const fetchImpl = jest
    .fn()
    .mockResolvedValue(
      jsonResponse(
        { jsonrpc: '2.0', id: 1, result: { capabilities: {} } },
        { 'mcp-session-id': 'sess-123' },
      ),
    );
  const client = new McpClient({ url: 'http://h:5008/mcp', fetchImpl });
  await client.initialize();
  // next call must carry the session id
  fetchImpl.mockResolvedValue(
    jsonResponse({ jsonrpc: '2.0', id: 2, result: { tools: [] } }),
  );
  await client.listTools();
  const lastCall = fetchImpl.mock.calls[fetchImpl.mock.calls.length - 1];
  const headers = lastCall[1].headers as Record<string, string>;
  expect(headers['Mcp-Session-Id']).toBe('sess-123');
});

test('listTools returns the tools array from result', async () => {
  const fetchImpl = jest
    .fn()
    .mockResolvedValueOnce(
      jsonResponse({ jsonrpc: '2.0', id: 1, result: {} }, { 'mcp-session-id': 's' }),
    )
    .mockResolvedValueOnce(
      jsonResponse({
        jsonrpc: '2.0',
        id: 2,
        result: { tools: [{ name: 'list_datasets', inputSchema: { type: 'object' } }] },
      }),
    );
  const client = new McpClient({ url: 'http://h/mcp', fetchImpl });
  await client.initialize();
  const tools = await client.listTools();
  expect(tools[0].name).toBe('list_datasets');
});

test('callTool returns structuredContent/content from result', async () => {
  const fetchImpl = jest
    .fn()
    .mockResolvedValueOnce(
      jsonResponse({ jsonrpc: '2.0', id: 1, result: {} }, { 'mcp-session-id': 's' }),
    )
    .mockResolvedValueOnce(
      jsonResponse({
        jsonrpc: '2.0',
        id: 2,
        result: { content: [{ type: 'text', text: '{"rows":2}' }] },
      }),
    );
  const client = new McpClient({ url: 'http://h/mcp', fetchImpl });
  await client.initialize();
  const out = await client.callTool('list_datasets', {});
  expect(out).toEqual('{"rows":2}');
});

test('sends Authorization header when token provided', async () => {
  const fetchImpl = jest
    .fn()
    .mockResolvedValue(
      jsonResponse({ jsonrpc: '2.0', id: 1, result: {} }, { 'mcp-session-id': 's' }),
    );
  const client = new McpClient({ url: 'http://h/mcp', token: 'tok', fetchImpl });
  await client.initialize();
  const headers = fetchImpl.mock.calls[0][1].headers as Record<string, string>;
  expect(headers.Authorization).toBe('Bearer tok');
});

test('throws McpError on JSON-RPC error payload', async () => {
  const fetchImpl = jest
    .fn()
    .mockResolvedValue(
      jsonResponse({ jsonrpc: '2.0', id: 1, error: { code: -32000, message: 'boom' } }),
    );
  const client = new McpClient({ url: 'http://h/mcp', fetchImpl });
  await expect(client.initialize()).rejects.toBeInstanceOf(McpError);
});
