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
// The literal colors in this file are default *data* values for color controls
// (the SVG renderer expects CSS color strings), not theme styling.
/* eslint-disable theme-colors/no-literal-colors */
import { t } from '@apache-superset/core/translation';
import { ControlPanelConfig } from '@superset-ui/chart-controls';
import StatusColorControl from './StatusColorControl';
import { DEFAULT_STATUS_COLORS } from './types';

const config: ControlPanelConfig = {
  controlPanelSections: [
    {
      label: t('Query'),
      expanded: true,
      controlSetRows: [['columns'], ['adhoc_filters'], ['row_limit']],
    },
    {
      label: t('Display'),
      expanded: true,
      controlSetRows: [
        [
          {
            name: 'color_range',
            config: {
              type: 'TextControl',
              label: t('Range color'),
              description: t(
                'Base color used in range mode (CSS color, e.g. #072cff).',
              ),
              default: '#072cff',
              renderTrigger: true,
            },
          },
        ],
        [
          {
            name: 'color_status',
            config: {
              type: StatusColorControl,
              label: t('Status colors'),
              description: t(
                'Map each status value to a color used in status mode.',
              ),
              default: DEFAULT_STATUS_COLORS,
              renderTrigger: true,
            },
          },
        ],
      ],
    },
    {
      label: t('Tooltip'),
      expanded: false,
      controlSetRows: [
        [
          {
            name: 'tooltip_show',
            config: {
              type: 'CheckboxControl',
              label: t('Show tooltip'),
              default: true,
              renderTrigger: true,
            },
          },
        ],
        [
          {
            name: 'tooltip_position',
            config: {
              type: 'SelectControl',
              label: t('Position'),
              clearable: false,
              renderTrigger: true,
              default: 'bottom',
              choices: [
                ['top', t('Top')],
                ['bottom', t('Bottom')],
              ],
            },
          },
          {
            name: 'tooltip_position_auto',
            config: {
              type: 'CheckboxControl',
              label: t('Auto position'),
              default: true,
              renderTrigger: true,
            },
          },
        ],
        [
          {
            name: 'tooltip_font_size',
            config: {
              type: 'TextControl',
              label: t('Font size'),
              isInt: true,
              default: 14,
              renderTrigger: true,
            },
          },
          {
            name: 'tooltip_padding',
            config: {
              type: 'TextControl',
              label: t('Padding'),
              isInt: true,
              default: 5,
              renderTrigger: true,
            },
          },
          {
            name: 'tooltip_border_radius',
            config: {
              type: 'TextControl',
              label: t('Border radius'),
              isInt: true,
              default: 5,
              renderTrigger: true,
            },
          },
        ],
        [
          {
            name: 'tooltip_font_family',
            config: {
              type: 'TextControl',
              label: t('Font family'),
              renderTrigger: true,
            },
          },
        ],
        [
          {
            name: 'tooltip_background',
            config: {
              type: 'TextControl',
              label: t('Background color'),
              default: 'white',
              renderTrigger: true,
            },
          },
          {
            name: 'tooltip_color',
            config: {
              type: 'TextControl',
              label: t('Text color'),
              default: 'black',
              renderTrigger: true,
            },
          },
          {
            name: 'tooltip_border_color',
            config: {
              type: 'TextControl',
              label: t('Border color'),
              default: 'white',
              renderTrigger: true,
            },
          },
        ],
      ],
    },
    {
      label: t('Label'),
      expanded: false,
      controlSetRows: [
        [
          {
            name: 'label_show',
            config: {
              type: 'CheckboxControl',
              label: t('Show labels'),
              default: false,
              renderTrigger: true,
            },
          },
        ],
        [
          {
            name: 'label_font_size',
            config: {
              type: 'TextControl',
              label: t('Font size'),
              isInt: true,
              default: 20,
              renderTrigger: true,
            },
          },
          {
            name: 'label_font_family',
            config: {
              type: 'TextControl',
              label: t('Font family'),
              default: 'Arial',
              renderTrigger: true,
            },
          },
        ],
        [
          {
            name: 'label_color',
            config: {
              type: 'TextControl',
              label: t('Color'),
              renderTrigger: true,
            },
          },
        ],
      ],
    },
  ],
};

export default config;
