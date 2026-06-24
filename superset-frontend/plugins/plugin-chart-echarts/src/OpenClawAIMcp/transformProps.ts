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
  OpenClawAIMcpChartProps,
  OpenClawModel,
  DEFAULT_FORM_DATA,
} from './types';

export interface OpenClawChatComponentProps {
  width: number;
  height: number;
  baseUrl: string;
  apiKey: string;
  model: OpenClawModel;
  systemPrompt: string;
  temperature: number;
  speedText: number;
  mcpEnabled: boolean;
  mcpUrl: string;
  mcpToken: string;
}

export default function transformProps(chartProps: OpenClawAIMcpChartProps) {
  const { width, height, formData, hooks } = chartProps;
  const { setDataMask = () => {} } = hooks;

  const merged = { ...DEFAULT_FORM_DATA, ...formData } as Record<
    string,
    unknown
  >;

  // Superset surfaces control values in BOTH snake_case (the control `name`)
  // and camelCase. For strings the snake_case copy holds the real value, but
  // the camelCase copy is authoritative for the MCP toggle. `??` is unsafe for
  // booleans (a snake_case `false` default would mask a camelCase `true`), so
  // prefer the camelCase value when either copy is set.
  const pickString = (snake: string, camel: string): unknown =>
    merged[snake] ?? merged[camel];
  const pickBool = (snake: string, camel: string): boolean =>
    Boolean(merged[camel] ?? merged[snake]);

  const componentProps: OpenClawChatComponentProps = {
    width,
    height,
    baseUrl:
      (pickString('base_url', 'baseUrl') as string) ??
      'https://openclaw.techpeople.ru/openclaw/',
    apiKey: (pickString('api_key', 'apiKey') as string) ?? '',
    model:
      (pickString('model', 'model') as OpenClawModel) ??
      'openclaw/data-analyst',
    systemPrompt:
      (pickString('system_prompt', 'systemPrompt') as string) ??
      'You are a helpful assistant.',
    temperature: (pickString('temperature', 'temperature') as number) ?? 1.0,
    speedText: (pickString('speed_text', 'speedText') as number) ?? 30,
    mcpEnabled: pickBool('mcp_enabled', 'mcpEnabled'),
    mcpUrl:
      (pickString('mcp_url', 'mcpUrl') as string) ??
      'http://localhost:5008/mcp',
    mcpToken: (pickString('mcp_token', 'mcpToken') as string) ?? '',
  };

  return {
    formData,
    echartOptions: {},
    setDataMask,
    refs: {},
    ...componentProps,
  };
}
