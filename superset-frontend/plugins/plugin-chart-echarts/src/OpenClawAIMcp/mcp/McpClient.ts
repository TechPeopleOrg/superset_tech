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

export class McpClient {
  private url: string;

  private token?: string;

  private fetchImpl: typeof fetch;

  private sessionId: string | null = null;

  private nextId = 1;

  constructor(opts: { url: string; token?: string; fetchImpl?: typeof fetch }) {
    this.url = opts.url;
    this.token = opts.token;
    this.fetchImpl = opts.fetchImpl ?? fetch;
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
    const body = JSON.parse(await response.text()) as JsonRpcResponse;
    if (body.error) {
      throw new McpError(body.error.message);
    }
    return body.result ?? {};
  }

  async initialize(): Promise<void> {
    await this.rpc('initialize', {
      protocolVersion: PROTOCOL_VERSION,
      capabilities: {},
      clientInfo: { name: 'openclaw-ai-mcp-chart', version: '1.0.0' },
    });
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
