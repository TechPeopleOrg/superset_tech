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
import { QueryFormData } from '@superset-ui/core';
import { BaseChartProps } from '../types';

export type OpenClawModel = 'openclaw/data-analyst';

// snake_case keys here match the `name` of each control in controlPanel.tsx.
// Superset stores control values in formData under their declared `name`,
// so keys must stay snake_case to round-trip with persisted chart configs.
export type OpenClawAIFormData = QueryFormData & {
  base_url?: string;
  api_key?: string;
  model?: OpenClawModel;
  system_prompt?: string;
  temperature?: number;
  speed_text?: number;
};

export interface OpenClawAIChartProps
  extends BaseChartProps<OpenClawAIFormData> {
  formData: OpenClawAIFormData;
}

export const DEFAULT_FORM_DATA: Partial<OpenClawAIFormData> = {
  base_url: 'https://openclaw.techpeople.ru/openclaw/',
  model: 'openclaw/data-analyst',
  system_prompt: 'You are a helpful assistant.',
  temperature: 1.0,
  speed_text: 30,
};
