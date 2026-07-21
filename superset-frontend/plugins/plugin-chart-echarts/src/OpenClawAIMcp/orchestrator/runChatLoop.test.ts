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
  runChatLoop,
  DEFAULT_MAX_ROUNDS,
  MAX_ROUNDS_MESSAGE,
  RunChatLoopDeps,
} from './runChatLoop';

function makeDeps(overrides: Partial<RunChatLoopDeps> = {}): RunChatLoopDeps {
  return {
    callOpenClaw: jest.fn(),
    listTools: jest.fn().mockResolvedValue([]),
    callTool: jest.fn(),
    model: 'm',
    temperature: 1,
    ...overrides,
  };
}

test('returns answer directly when no tool calls', async () => {
  const deps = makeDeps({
    callOpenClaw: jest
      .fn()
      .mockResolvedValue({ role: 'assistant', content: 'final', tool_calls: undefined }),
  });
  const res = await runChatLoop({ messages: [{ role: 'user', content: 'hi' }], deps });
  expect(res.answer).toBe('final');
  expect(res.rounds).toBe(1);
});

test('executes a tool call then returns the follow-up answer', async () => {
  const callOpenClaw = jest
    .fn()
    .mockResolvedValueOnce({
      role: 'assistant',
      content: null,
      tool_calls: [
        { id: 'c1', type: 'function', function: { name: 'list_datasets', arguments: '{}' } },
      ],
    })
    .mockResolvedValueOnce({ role: 'assistant', content: 'done', tool_calls: undefined });
  const callTool = jest.fn().mockResolvedValue({ rows: 1 });
  const deps = makeDeps({ callOpenClaw, callTool });
  const res = await runChatLoop({ messages: [{ role: 'user', content: 'q' }], deps });
  expect(callTool).toHaveBeenCalledWith('list_datasets', {});
  expect(res.answer).toBe('done');
  expect(res.rounds).toBe(2);
});

test('stops with cap message when maxRounds exceeded', async () => {
  const callOpenClaw = jest.fn().mockResolvedValue({
    role: 'assistant',
    content: null,
    tool_calls: [
      { id: 'c', type: 'function', function: { name: 't', arguments: '{}' } },
    ],
  });
  const deps = makeDeps({ callOpenClaw, callTool: jest.fn().mockResolvedValue({}) });
  const res = await runChatLoop({ messages: [], deps, maxRounds: 2 });
  expect(res.rounds).toBe(2);
  expect(res.answer).toBe(MAX_ROUNDS_MESSAGE);
});

test('a failing tool feeds the error back as a tool message and continues', async () => {
  const callOpenClaw = jest
    .fn()
    .mockResolvedValueOnce({
      role: 'assistant',
      content: null,
      tool_calls: [
        { id: 'c1', type: 'function', function: { name: 'bad', arguments: '{}' } },
      ],
    })
    .mockResolvedValueOnce({ role: 'assistant', content: 'recovered', tool_calls: undefined });
  const callTool = jest.fn().mockRejectedValue(new Error('tool blew up'));
  const deps = makeDeps({ callOpenClaw, callTool });
  const res = await runChatLoop({ messages: [], deps });
  expect(res.answer).toBe('recovered');
  // second OpenClaw call must include a tool message carrying the error text
  const secondCallMessages = (callOpenClaw.mock.calls[1][0].messages) as {
    role: string;
    content: string | null;
  }[];
  const toolMsg = secondCallMessages.find(m => m.role === 'tool');
  expect(toolMsg?.content).toContain('tool blew up');
});

test('DEFAULT_MAX_ROUNDS is 5', () => {
  expect(DEFAULT_MAX_ROUNDS).toBe(5);
});
