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
import transformProps from './transformProps';
import controlPanel from './controlPanel';
import { OpenClawAIChartProps, OpenClawAIFormData } from './types';

const DEFAULT_PROMPT = 'You are a helpful assistant.';

const propsFor = (formData: Partial<OpenClawAIFormData>) =>
  ({
    width: 400,
    height: 400,
    formData,
    hooks: {},
  }) as unknown as OpenClawAIChartProps;

test('a blank stored prompt falls back to the default', () => {
  expect(transformProps(propsFor({ system_prompt: '' })).systemPrompt).toBe(
    DEFAULT_PROMPT,
  );
  expect(transformProps(propsFor({ system_prompt: '   ' })).systemPrompt).toBe(
    DEFAULT_PROMPT,
  );
});

test('a missing prompt falls back to the default', () => {
  expect(transformProps(propsFor({})).systemPrompt).toBe(DEFAULT_PROMPT);
});

test('a configured prompt is passed through unchanged', () => {
  expect(
    transformProps(propsFor({ system_prompt: '  Ты аналитик  ' })).systemPrompt,
  ).toBe('  Ты аналитик  ');
});

test('the system prompt control declares a language', () => {
  // TextAreaControl ignores `value` and renders blank unless a language is set.
  const controls = controlPanel.controlPanelSections
    .flatMap(section => section?.controlSetRows ?? [])
    .flat();
  const systemPrompt = controls.find(
    control =>
      typeof control === 'object' &&
      control !== null &&
      'name' in control &&
      control.name === 'system_prompt',
  );

  expect(systemPrompt).toBeDefined();
  const { language } = (systemPrompt as { config: { language?: string } })
    .config;
  expect(language).toBeTruthy();
});
