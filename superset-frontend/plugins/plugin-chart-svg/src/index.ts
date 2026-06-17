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
import { ChartMetadata, ChartPlugin } from '@superset-ui/core';
import transformProps from './transformProps';
import controlPanel from './controlPanel';
import buildQuery from './buildQuery';
import thumbnail from './images/thumbnail.png';
import thumbnailDark from './images/thumbnail-dark.png';
import { SvgFormData } from './types';

// must export something for the module to exist in dev mode
export * from './types';

const metadata = new ChartMetadata({
  category: t('SVG'),
  description: t('Renders an SVG drawing from the dataset on screen.'),
  name: t('SVG'),
  tags: [t('Business'), t('Featured')],
  thumbnail,
  thumbnailDark,
});

export default class SvgChartPlugin extends ChartPlugin<SvgFormData> {
  constructor() {
    super({
      loadChart: () => import('./SvgChart'),
      metadata,
      transformProps,
      controlPanel,
      buildQuery,
    });
  }
}
