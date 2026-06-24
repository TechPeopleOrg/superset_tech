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

import { McpTool } from './toolAdapter';

export class McpError extends Error {}

interface JsonRpcResponse {
  jsonrpc: string;
  id: number;
  result?: Record<string, unknown>;
  error?: { code: number; message: string };
}

const PROTOCOL_VERSION = '2025-06-18';

/**
 * The streamable-http transport may answer either with plain JSON or with an
 * SSE stream (`text/event-stream`), where the JSON-RPC payload lives in one or
 * more `data:` lines. Extract the JSON from whichever shape we got.
 */
function parseRpcBody(raw: string): JsonRpcResponse {
  const trimmed = raw.trim();
  if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
    return JSON.parse(trimmed) as JsonRpcResponse;
  }
  // SSE: collect `data:` lines and parse the last JSON object found.
  const dataLines = trimmed
    .split('\n')
    .filter(line => line.startsWith('data:'))
    .map(line => line.slice('data:'.length).trim())
    .filter(Boolean);
  for (let i = dataLines.length - 1; i >= 0; i -= 1) {
    try {
      return JSON.parse(dataLines[i]) as JsonRpcResponse;
    } catch {
      // try the previous data line
    }
  }
  throw new McpError('Could not parse MCP response body');
}

export class McpClient {
  private url: string;

  private token?: string;

  private fetchImpl: typeof fetch;

  private sessionId: string | null = null;

  private nextId = 1;

  constructor(opts: { url: string; token?: string; fetchImpl?: typeof fetch }) {
    this.url = opts.url;
    this.token = opts.token;
    // A bare browser `fetch` reference loses its binding to `window` and throws
    // "Illegal invocation" when called as a method, so bind it.
    this.fetchImpl =
      opts.fetchImpl ??
      (typeof window !== 'undefined' ? window.fetch.bind(window) : fetch);
  }

  private buildHeaders(): Record<string, string> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      Accept: 'application/json, text/event-stream',
    };
    if (this.token) headers.Authorization = `Bearer ${this.token}`;
    if (this.sessionId) headers['Mcp-Session-Id'] = this.sessionId;
    return headers;
  }

  private async rpc(
    method: string,
    params: Record<string, unknown>,
  ): Promise<Record<string, unknown>> {
    const id = this.nextId;
    this.nextId += 1;
    const response = await this.fetchImpl(this.url, {
      method: 'POST',
      headers: this.buildHeaders(),
      body: JSON.stringify({ jsonrpc: '2.0', id, method, params }),
    });
    const sid = response.headers.get('mcp-session-id');
    if (sid) this.sessionId = sid;
    if (!response.ok) {
      throw new McpError(`MCP HTTP ${response.status}`);
    }
    const body = parseRpcBody(await response.text());
    if (body.error) {
      throw new McpError(body.error.message);
    }
    return body.result ?? {};
  }

  /**
   * Send a JSON-RPC notification (no `id`, no response expected). Required to
   * complete the MCP handshake via `notifications/initialized`.
   */
  private async notify(
    method: string,
    params: Record<string, unknown> = {},
  ): Promise<void> {
    await this.fetchImpl(this.url, {
      method: 'POST',
      headers: this.buildHeaders(),
      body: JSON.stringify({ jsonrpc: '2.0', method, params }),
    });
  }

  async initialize(): Promise<void> {
    await this.rpc('initialize', {
      protocolVersion: PROTOCOL_VERSION,
      capabilities: {},
      clientInfo: { name: 'openclaw-ai-mcp-chart', version: '1.0.0' },
    });
    // Complete the handshake; without this the server keeps the session in an
    // uninitialized state and tools/list can come back empty.
    await this.notify('notifications/initialized');
  }

  async listTools(): Promise<McpTool[]> {
    const result = await this.rpc('tools/list', {});
    return (result.tools as McpTool[]) ?? [];
  }

  async callTool(
    name: string,
    args: Record<string, unknown>,
  ): Promise<unknown> {
    const result = await this.rpc('tools/call', { name, arguments: args });
    if (result.structuredContent !== undefined) {
      return result.structuredContent;
    }
    const content = result.content as
      | { type: string; text?: string }[]
      | undefined;
    if (content && content.length > 0 && content[0].text !== undefined) {
      return content[0].text;
    }
    return result;
  }
}
