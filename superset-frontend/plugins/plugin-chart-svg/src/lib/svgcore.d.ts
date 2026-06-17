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

// Minimal type declarations for the bundled SVGCore library (src/lib/svgcore.js).
// The runtime implementation is the untyped ES bundle; these types describe the
// public surface used by the plugin.

export interface SvgCoreTooltipOptions {
  show?: boolean;
  position?: 'top' | 'bottom';
  positionAuto?: boolean;
  fontSize?: number;
  fontFamily?: string;
  background?: string;
  borderColor?: string;
  borderRadius?: number;
  color?: string;
  padding?: number;
  className?: string;
  formatter?: (str: string) => string;
}

export interface SvgCoreLabelOptions {
  show?: boolean;
  color?: string;
  fontSize?: number;
  fontFamily?: string;
  className?: string;
  formatter?: (str: string) => string;
}

export interface SvgCoreStatusColor {
  status: string;
  color: string;
}

export interface SvgCoreDataItem {
  name: string;
  value: number;
  status?: string;
}

export interface SvgCoreEvents {
  click?: (value: unknown) => void;
  dblclick?: (value: unknown) => void;
}

export interface SvgCoreOptions {
  type?: 'value' | 'range' | 'status';
  colorRange?: string;
  colorStatus?: SvgCoreStatusColor[];
  tooltip?: SvgCoreTooltipOptions;
  label?: SvgCoreLabelOptions;
  events?: SvgCoreEvents;
  data?: SvgCoreDataItem[];
}

export default class SVGCore {
  constructor(containerNode: HTMLElement, strSVG: string);

  setOption(options: SvgCoreOptions): void;

  destroy(): void;
}
