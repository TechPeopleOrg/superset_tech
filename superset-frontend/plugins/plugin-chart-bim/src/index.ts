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
import { Behavior, ChartMetadata, ChartPlugin } from '@superset-ui/core';
import transformProps from './transformProps';
import controlPanel from './controlPanel';
import buildQuery from './buildQuery';
import thumbnail from './images/thumbnail.png';
import thumbnailDark from './images/thumbnail-dark.png';
import { BimFormData } from './types';

export * from './types';

const metadata = new ChartMetadata({
  // InteractiveChart tells Superset this chart emits cross-filters, so the
  // dashboard turns on cross-filtering (chartProps.emitCrossFilters) for it.
  // SuppressRefetchSpinner keeps the heavy 3D viewer mounted during re-fetches
  // (filter/cross-filter changes) so the model is not reloaded every time.
  behaviors: [Behavior.InteractiveChart, Behavior.SuppressRefetchSpinner],
  category: t('BIM'),
  description: t('Renders a BIM model (.xkt) from file-storage using xeokit.'),
  name: t('BIM Viewer'),
  tags: [t('Business'), t('Featured')],
  thumbnail,
  thumbnailDark,
});

export default class BimChartPlugin extends ChartPlugin<BimFormData> {
  constructor() {
    super({
      loadChart: () => import('./BimChart'),
      metadata,
      transformProps,
      controlPanel,
      buildQuery,
    });
  }
}
