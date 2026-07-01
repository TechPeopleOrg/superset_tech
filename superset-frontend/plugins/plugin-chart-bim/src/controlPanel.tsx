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
import { ControlPanelConfig, columnChoices, ControlPanelState } from '@superset-ui/chart-controls';

const config: ControlPanelConfig = {
  controlPanelSections: [
    {
      label: t('Query'),
      expanded: true,
      controlSetRows: [['columns'], ['adhoc_filters'], ['row_limit']],
    },
    {
      label: t('Model source'),
      expanded: true,
      controlSetRows: [
        [
          {
            name: 'model_column',
            config: {
              type: 'SelectControl',
              label: t('Model column'),
              description: t(
                'Dataset column holding the model UUID (value of the first row is used).',
              ),
              default: null,
              mapStateToProps: (state: ControlPanelState) => ({
                choices: columnChoices(state.datasource),
              }),
            },
          },
        ],
      ],
    },
    {
      label: t('Viewer'),
      expanded: false,
      controlSetRows: [
        [
          {
            name: 'background_color',
            config: {
              type: 'TextControl',
              label: t('Background color'),
              description: t('Scene background (CSS color, e.g. #ffffff).'),
              default: '#ffffff',
              renderTrigger: true,
            },
          },
        ],
        [
          {
            name: 'show_edges',
            config: {
              type: 'CheckboxControl',
              label: t('Show edges'),
              default: false,
              renderTrigger: true,
            },
          },
        ],
      ],
    },
  ],
};

export default config;
