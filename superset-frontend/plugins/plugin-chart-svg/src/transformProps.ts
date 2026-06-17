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
import { ChartProps, DataRecord } from '@superset-ui/core';
import { SvgChartProps, SvgConfigurableOptions, SvgFormData } from './types';

function toNumber(value: unknown, fallback: number): number {
  const num = Number(value);
  return Number.isFinite(num) ? num : fallback;
}

export default function transformProps(chartProps: ChartProps): SvgChartProps {
  const { width, height, formData, queriesData } = chartProps;
  const fd = formData as SvgFormData;

  const queryData = queriesData?.[0];
  const data = (queryData?.data ?? []) as DataRecord[];
  const columns = (queryData?.colnames ?? []) as string[];

  const svgOptions: SvgConfigurableOptions = {
    colorRange: fd.colorRange ?? '#072cff',
    colorStatus: fd.colorStatus ?? [],
    tooltip: {
      show: fd.tooltipShow ?? true,
      position: fd.tooltipPosition ?? 'bottom',
      positionAuto: fd.tooltipPositionAuto ?? true,
      fontSize: toNumber(fd.tooltipFontSize, 14),
      fontFamily: fd.tooltipFontFamily,
      background: fd.tooltipBackground ?? 'white',
      borderColor: fd.tooltipBorderColor ?? 'white',
      borderRadius: toNumber(fd.tooltipBorderRadius, 5),
      color: fd.tooltipColor ?? 'black',
      padding: toNumber(fd.tooltipPadding, 5),
    },
    label: {
      show: fd.labelShow ?? false,
      fontSize: toNumber(fd.labelFontSize, 20),
      fontFamily: fd.labelFontFamily ?? 'Arial',
      color: fd.labelColor,
    },
  };

  return {
    width,
    height,
    formData: fd,
    data,
    columns,
    svg: '',
    svgOptions,
  };
}
