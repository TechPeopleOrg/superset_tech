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
import { t } from '@apache-superset/core/translation';
import { ControlPanelConfig } from '@superset-ui/chart-controls';

const config: ControlPanelConfig = {
  controlPanelSections: [
    {
      label: t('Query'),
      expanded: true,
      controlSetRows: [['metric']],
    },
    {
      label: t('Chart Options'),
      expanded: true,
      controlSetRows: [
        [
          {
            name: 'base_url',
            config: {
              type: 'TextControl',
              label: t('Base URL'),
              renderTrigger: true,
              default: 'https://openclaw.techpeople.ru/openclaw/',
              description: t(
                'Root URL of an OpenAI-compatible chat API (OpenClaw, OpenAI, ' +
                  'a local LLM, etc.). The /v1/chat/completions path is ' +
                  'appended automatically. For MCP data access the provider ' +
                  'must support function calling (tool_calls).',
              ),
            },
          },
        ],
        [
          {
            name: 'api_key',
            config: {
              type: 'TextControl',
              label: t('API Key'),
              renderTrigger: true,
              default: '',
              description: t(
                'Bearer token for the chat provider (OpenClaw gateway, ' +
                  'OpenAI key, etc.).',
              ),
            },
          },
        ],
        [
          {
            name: 'model',
            config: {
              type: 'TextControl',
              label: t('Model'),
              default: 'openclaw/data-analyst',
              renderTrigger: true,
              description: t(
                'Model name sent to the provider, e.g. ' +
                  '"openclaw/data-analyst", "gpt-4o", or a local model id.',
              ),
            },
          },
        ],
        [
          {
            name: 'system_prompt',
            config: {
              type: 'TextAreaControl',
              label: t('System prompt'),
              renderTrigger: true,
              default: 'You are a helpful assistant.',
              description: t('Sent as the system message on every request'),
            },
          },
        ],
        [
          {
            name: 'temperature',
            config: {
              type: 'NumberControl',
              label: t('Temperature'),
              min: 0,
              max: 2,
              step: 0.1,
              default: 1.0,
              renderTrigger: true,
              description: t('Sampling temperature (0..2)'),
            },
          },
        ],
        [
          {
            name: 'speed_text',
            config: {
              type: 'NumberControl',
              label: t('Speed text'),
              min: 0,
              max: 100,
              default: 30,
              renderTrigger: true,
              description: t(
                'Milliseconds per character for the typing effect',
              ),
            },
          },
        ],
      ],
    },
    {
      label: t('Superset MCP'),
      expanded: true,
      controlSetRows: [
        [
          {
            name: 'mcp_enabled',
            config: {
              type: 'CheckboxControl',
              label: t('Enable Superset MCP data access'),
              renderTrigger: true,
              default: false,
              description: t(
                'When enabled, the agent can call Superset MCP tools to read data.',
              ),
            },
          },
        ],
        [
          {
            name: 'mcp_url',
            config: {
              type: 'TextControl',
              label: t('MCP URL'),
              renderTrigger: true,
              default: 'http://62.109.11.2:5008/mcp',
              description: t('Full URL of the Superset MCP endpoint (…/mcp).'),
            },
          },
        ],
        [
          {
            name: 'mcp_token',
            config: {
              type: 'TextControl',
              label: t('MCP token (optional)'),
              renderTrigger: true,
              default: '',
              description: t(
                'Bearer token for the MCP server. Leave empty in dev mode.',
              ),
            },
          },
        ],
      ],
    },
  ],
};

export default config;
