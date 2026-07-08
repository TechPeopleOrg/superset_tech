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

import { ChatMessage, ChatToolCall, OpenAITool } from '../mcp/toolAdapter';

export class OpenClawError extends Error {}

export interface ChatChoiceMessage {
  role: 'assistant';
  content: string | null;
  tool_calls?: ChatToolCall[];
}

export type CallOpenClaw = (req: {
  messages: ChatMessage[];
  tools?: OpenAITool[];
  model: string;
  temperature: number;
}) => Promise<ChatChoiceMessage>;

interface OpenClawResponse {
  choices?: { message?: ChatChoiceMessage }[];
  error?: { message?: string };
}

export function createOpenClawApi(opts: {
  baseUrl: string;
  apiKey: string;
  fetchImpl?: typeof fetch;
}): CallOpenClaw {
  // A bare browser `fetch` reference loses its binding to `window` and throws
  // "Illegal invocation" when called this way, so bind it.
  const fetchImpl =
    opts.fetchImpl ??
    (typeof window !== 'undefined' ? window.fetch.bind(window) : fetch);
  const endpoint = `${opts.baseUrl.replace(/\/+$/, '')}/v1/chat/completions`;

  return async req => {
    const response = await fetchImpl(endpoint, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${opts.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: req.model,
        messages: req.messages,
        temperature: req.temperature,
        stream: false,
        ...(req.tools ? { tools: req.tools, tool_choice: 'auto' } : {}),
      }),
    });

    const body = (await response.json()) as OpenClawResponse;
    if (!response.ok) {
      throw new OpenClawError(
        body?.error?.message ?? `HTTP ${response.status}`,
      );
    }
    const message = body.choices?.[0]?.message;
    if (!message) {
      throw new OpenClawError('OpenClaw returned no message');
    }
    return message;
  };
}
