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
  ChatMessage,
  OpenAITool,
  parseToolArguments,
  toolResultToMessage,
} from '../mcp/toolAdapter';
import { CallOpenClaw } from '../openclaw/OpenClawApi';

export const DEFAULT_MAX_ROUNDS = 5;
export const MAX_ROUNDS_MESSAGE =
  'Агент не уложился в лимит обращений к данным. Попробуйте переформулировать вопрос.';

export interface RunChatLoopDeps {
  callOpenClaw: CallOpenClaw;
  listTools: () => Promise<OpenAITool[]>;
  callTool: (name: string, args: Record<string, unknown>) => Promise<unknown>;
  model: string;
  temperature: number;
}

export interface RunChatLoopResult {
  answer: string;
  rounds: number;
}

export async function runChatLoop(input: {
  messages: ChatMessage[];
  deps: RunChatLoopDeps;
  maxRounds?: number;
}): Promise<RunChatLoopResult> {
  const { deps } = input;
  const maxRounds = input.maxRounds ?? DEFAULT_MAX_ROUNDS;
  const tools = await deps.listTools();
  const messages: ChatMessage[] = [...input.messages];

  let rounds = 0;
  while (rounds < maxRounds) {
    rounds += 1;
    const message = await deps.callOpenClaw({
      messages,
      tools: tools.length > 0 ? tools : undefined,
      model: deps.model,
      temperature: deps.temperature,
    });

    if (!message.tool_calls || message.tool_calls.length === 0) {
      return { answer: message.content ?? '', rounds };
    }

    messages.push({
      role: 'assistant',
      content: message.content,
      tool_calls: message.tool_calls,
    });

    // Execute each requested tool, feeding results (or errors) back.
    // eslint-disable-next-line no-await-in-loop
    await Promise.all(
      message.tool_calls.map(async call => {
        const args = parseToolArguments(call.function.arguments);
        try {
          const result = await deps.callTool(call.function.name, args);
          messages.push(toolResultToMessage(call.id, result));
        } catch (err) {
          const text = err instanceof Error ? err.message : String(err);
          messages.push(toolResultToMessage(call.id, `ERROR: ${text}`));
        }
      }),
    );
  }

  return { answer: MAX_ROUNDS_MESSAGE, rounds };
}
