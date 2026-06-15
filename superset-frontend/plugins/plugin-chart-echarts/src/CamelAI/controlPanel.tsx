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
      controlSetRows: [
        ['metric'],
      ],
    },
    {
      label: t('Chart Options'),
      expanded: true,
      controlSetRows: [
        [
          {
            name: 'token',
            config: {
              type: 'TextControl',
              label: t('Token'),
              renderTrigger: true,
              default: '',
              description: '',
            },
          },
        ],
        [
          {
            name: 'model',
            config: {
              type: 'SelectControl',
              label: t('Model'),
              default: 'gpt-5',
              renderTrigger: true,
              choices: [
                ['sonnet-4', t('Sonnet 4')],
                ['sonnet-4.5', t('Sonnet 4.5')],
                ['haiku-4.5', t('Haiku 4.5')],
                ['o3', t('o3')],
                ['o4-mini', t('o4-mini')],
                ['gpt-4.1', t('GPT-4.1')],
                ['gpt-5', t('GPT-5')],
                ['gpt-5-codex', t('GPT-5 Codex')],
              ],
              description: '',
            },
          },
        ],
        [
          {
            name: 'source_id',
            config: {
              type: 'TextControl',
              label: t('Source id'),
              renderTrigger: true,
              default: undefined,
              description: '',
            },
          },
        ],
        [
          {
            name: 'thread_id',
            config: {
              type: 'TextControl',
              label: t('Thread id'),
              renderTrigger: true,
              default: undefined,
              description: '',
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
              description: '',
            },
          },
        ],
      ],
    },
  ],
  // controlOverrides: {
  //   series: {
  //     validators: [validateNonEmpty],
  //     clearable: false,
  //   },
  //   row_limit: {
  //     default: 100,
  //   },
  // },
  // formDataOverrides: formData => ({
  //   ...formData,
  //   metric: getStandardizedControls().shiftMetric(),
  //   groupby: getStandardizedControls().popAllColumns(),
  //   row_limit:
  //     ensureIsInt(formData.row_limit, 100) >= 100 ? 100 : formData.row_limit,
  // }),
};

export default config;
