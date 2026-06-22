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
  mcpToolsToOpenAI,
  toolResultToMessage,
  parseToolArguments,
  McpTool,
} from './toolAdapter';

test('mcpToolsToOpenAI maps name, description and schema', () => {
  const tools: McpTool[] = [
    { name: 'list_datasets', description: 'List', inputSchema: { type: 'object' } },
  ];
  expect(mcpToolsToOpenAI(tools)).toEqual([
    {
      type: 'function',
      function: {
        name: 'list_datasets',
        description: 'List',
        parameters: { type: 'object' },
      },
    },
  ]);
});

test('mcpToolsToOpenAI falls back to empty object schema when missing', () => {
  const tools: McpTool[] = [{ name: 't', inputSchema: undefined as never }];
  expect(mcpToolsToOpenAI(tools)[0].function.parameters).toEqual({
    type: 'object',
    properties: {},
  });
});

test('toolResultToMessage serializes result into a tool message', () => {
  const msg = toolResultToMessage('call_1', { rows: 3 });
  expect(msg).toEqual({
    role: 'tool',
    tool_call_id: 'call_1',
    content: '{"rows":3}',
  });
});

test('toolResultToMessage stringifies primitive results', () => {
  expect(toolResultToMessage('c', 'hello').content).toBe('hello');
});

test('parseToolArguments returns {} for empty or invalid JSON', () => {
  expect(parseToolArguments('')).toEqual({});
  expect(parseToolArguments('not json')).toEqual({});
  expect(parseToolArguments('{"a":1}')).toEqual({ a: 1 });
});
