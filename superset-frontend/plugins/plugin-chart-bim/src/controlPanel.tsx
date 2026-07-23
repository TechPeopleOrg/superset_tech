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
import {
  ControlPanelConfig,
  columnChoices,
  ControlPanelState,
} from '@superset-ui/chart-controls';

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
          // TEMPORARY (manual testing without a dataset): paste a model UUID
          // here to load it directly; overrides the model column below. Remove
          // once dataset-driven use is the norm.
          {
            name: 'model_uuid',
            config: {
              type: 'TextControl',
              label: t('Model UUID (manual)'),
              description: t(
                'Paste a storage UUID to load a model directly, without a dataset. Overrides the model column.',
              ),
              default: '',
              renderTrigger: true,
            },
          },
        ],
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
      label: t('Data binding'),
      expanded: true,
      controlSetRows: [
        [
          {
            name: 'link_column',
            config: {
              type: 'SelectControl',
              label: t('Element GlobalId column'),
              description: t(
                'Dataset column holding the element IFC GlobalId. Required for coloring.',
              ),
              default: null,
              mapStateToProps: (state: ControlPanelState) => ({
                choices: columnChoices(state.datasource),
              }),
            },
          },
        ],
        [
          {
            name: 'color_by',
            config: {
              type: 'SelectControl',
              label: t('Color by column'),
              description: t(
                'Dataset column whose value drives element color. Leave empty for no coloring.',
              ),
              default: null,
              mapStateToProps: (state: ControlPanelState) => ({
                choices: columnChoices(state.datasource),
              }),
            },
          },
        ],
        [
          {
            name: 'color_overrides',
            config: {
              type: 'TextAreaControl',
              language: 'json',
              label: t('Color overrides (JSON)'),
              description: t(
                'Optional JSON mapping values to #rrggbb hex colors, overriding the automatic palette, e.g. {"Done":"#00ff00","Late":"#ff0000"}. Colors must be hex (#rrggbb); CSS names like "red" are ignored. An array form [{"value","color"}] is also accepted.',
              ),
              default: '',
              renderTrigger: true,
            },
          },
        ],
      ],
    },
    {
      label: t('Viewer'),
      expanded: true,
      controlSetRows: [
        [
          {
            name: 'nav_mode',
            config: {
              type: 'SelectControl',
              label: t('Navigation mode'),
              description: t(
                'Orbit rotates around a pivot (inspect from outside); First person rotates in place (walk-through/look-around); Plan view is top-down.',
              ),
              clearable: false,
              renderTrigger: true,
              default: 'firstPerson',
              choices: [
                ['firstPerson', t('First person')],
                ['orbit', t('Orbit')],
                ['planView', t('Plan view')],
              ],
            },
          },
        ],
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
