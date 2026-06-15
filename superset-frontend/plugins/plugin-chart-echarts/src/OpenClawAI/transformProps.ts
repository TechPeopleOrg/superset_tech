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
  OpenClawAIChartProps,
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
}

export default function transformProps(chartProps: OpenClawAIChartProps) {
  const { width, height, formData, hooks } = chartProps;
  const { setDataMask = () => {} } = hooks;

  const merged = { ...DEFAULT_FORM_DATA, ...formData };

  // formData uses snake_case (matches control `name`); component props use camelCase.
  const componentProps: OpenClawChatComponentProps = {
    width,
    height,
    baseUrl: (merged.base_url as string) ?? 'http://212.57.126.191/openclaw',
    apiKey: (merged.api_key as string) ?? '',
    model: (merged.model as OpenClawModel) ?? 'openclaw/data-analyst',
    systemPrompt:
      (merged.system_prompt as string) ?? 'You are a helpful assistant.',
    temperature: (merged.temperature as number) ?? 1.0,
    speedText: (merged.speed_text as number) ?? 30,
  };

  return {
    formData,
    echartOptions: {},
    setDataMask,
    refs: {},
    ...componentProps,
  };
}
