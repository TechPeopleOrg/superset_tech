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
import { styled } from '@apache-superset/core/theme';
import type { GradientLegend } from './colorMapping';
import { scaleCssGradient } from './gradientScales';

export interface ColorLegendProps {
  legend: { value: string; color: string }[];
  // Present → gradient legend (bar + bounds) instead of chips.
  gradient?: GradientLegend;
}

const Wrap = styled.div`
  position: absolute;
  right: ${({ theme }) => theme.sizeUnit * 2}px;
  bottom: ${({ theme }) => theme.sizeUnit * 2}px;
  z-index: 10;
  max-height: 40%;
  overflow-y: auto;
  padding: ${({ theme }) => theme.sizeUnit * 2}px;
  background: ${({ theme }) => theme.colorBgContainer};
  border: 1px solid ${({ theme }) => theme.colorBorder};
  border-radius: ${({ theme }) => theme.borderRadius}px;
`;

const Row = styled.div`
  display: flex;
  align-items: center;
  gap: ${({ theme }) => theme.sizeUnit}px;
  font-size: ${({ theme }) => theme.fontSizeSM}px;
  color: ${({ theme }) => theme.colorText};
`;

const Swatch = styled.span<{ color: string }>`
  width: ${({ theme }) => theme.sizeUnit * 2}px;
  height: ${({ theme }) => theme.sizeUnit * 2}px;
  border-radius: 2px;
  background: ${({ color }) => color};
  flex: none;
`;

const Bar = styled.div<{ gradient: string }>`
  width: ${({ theme }) => theme.sizeUnit * 24}px;
  height: ${({ theme }) => theme.sizeUnit * 2}px;
  border-radius: 2px;
  background: ${({ gradient }) => gradient};
`;

const Bounds = styled.div`
  display: flex;
  justify-content: space-between;
  margin-top: ${({ theme }) => theme.sizeUnit / 2}px;
  font-size: ${({ theme }) => theme.fontSizeSM}px;
  color: ${({ theme }) => theme.colorTextSecondary};
  font-variant-numeric: tabular-nums;
`;

// Compact bounds format, any unit.
const numberFmt = new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 });

export default function ColorLegend({ legend, gradient }: ColorLegendProps) {
  if (gradient) {
    return (
      <Wrap data-test="bim-legend">
        <Bar
          data-test="bim-legend-gradient"
          gradient={scaleCssGradient(gradient.scaleId)}
        />
        <Bounds>
          <span>{numberFmt.format(gradient.min)}</span>
          <span>{numberFmt.format(gradient.max)}</span>
        </Bounds>
      </Wrap>
    );
  }
  if (!legend.length) return null;
  return (
    <Wrap data-test="bim-legend">
      {legend.map(({ value, color }) => (
        <Row key={value}>
          <Swatch color={color} />
          <span>{value}</span>
        </Row>
      ))}
    </Wrap>
  );
}
