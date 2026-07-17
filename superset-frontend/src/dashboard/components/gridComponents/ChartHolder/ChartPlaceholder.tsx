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
import { css, useTheme } from '@apache-superset/core/theme';
import { t } from '@apache-superset/core/translation';
import { Icons } from '@superset-ui/core/components/Icons';

interface ChartPlaceholderProps {
  width: number;
  height: number;
  sliceName: string;
}

/**
 * Lightweight stand-in rendered instead of the real chart while the
 * "layout mode" toggle is active in the dashboard editor. Keeps the
 * chart's exact footprint for drag/resize without querying any data.
 */
export default function ChartPlaceholder({
  width,
  height,
  sliceName,
}: ChartPlaceholderProps) {
  const theme = useTheme();
  return (
    <div
      data-test="chart-placeholder"
      css={css`
        width: ${width}px;
        height: ${height}px;
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        gap: ${theme.sizeUnit * 2}px;
        border: 1px dashed ${theme.colorBorder};
        border-radius: ${theme.borderRadius}px;
        background-color: ${theme.colorBgLayout};
        color: ${theme.colorTextSecondary};
        overflow: hidden;
      `}
    >
      <Icons.BarChartOutlined iconSize="xl" />
      <span
        css={css`
          font-weight: ${theme.fontWeightStrong};
          color: ${theme.colorText};
          max-width: 90%;
          text-align: center;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        `}
      >
        {sliceName}
      </span>
      <span
        css={css`
          font-size: ${theme.fontSizeSM}px;
        `}
      >
        {t('Chart rendering paused (layout mode)')}
      </span>
    </div>
  );
}
