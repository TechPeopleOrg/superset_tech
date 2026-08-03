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
import { Slider } from '@superset-ui/core/components';
import type { GradientLegend } from './colorMapping';
import { scaleCssGradient } from './gradientScales';

export interface ColorLegendProps {
  legend: { value: string; color: string }[];
  // Present → gradient legend (bar + bounds) instead of chips.
  gradient?: GradientLegend;
  dimmed?: Set<string>;
  onToggle?: (value: string) => void;
  range?: [number, number];
  onRangeChange?: (range: [number, number]) => void;
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

const Row = styled.button<{ dimmed?: boolean; interactive?: boolean }>`
  display: flex;
  align-items: center;
  width: 100%;
  gap: ${({ theme }) => theme.sizeUnit}px;
  padding: 0;
  border: none;
  background: none;
  text-align: left;
  font-size: ${({ theme }) => theme.fontSizeSM}px;
  color: ${({ theme, dimmed }) =>
    dimmed ? theme.colorTextTertiary : theme.colorText};
  cursor: ${({ interactive }) => (interactive ? 'pointer' : 'default')};
  opacity: ${({ dimmed }) => (dimmed ? 0.5 : 1)};

  &:focus-visible {
    outline: 2px solid ${({ theme }) => theme.colorPrimary};
    outline-offset: 1px;
  }
`;

const Swatch = styled.span<{ color: string; dimmed?: boolean }>`
  width: ${({ theme }) => theme.sizeUnit * 2}px;
  height: ${({ theme }) => theme.sizeUnit * 2}px;
  border-radius: 2px;
  background: ${({ color, dimmed }) => (dimmed ? 'transparent' : color)};
  border: 1px solid ${({ color }) => color};
  flex: none;
`;

const Bar = styled.div<{ gradient: string }>`
  width: ${({ theme }) => theme.sizeUnit * 36}px;
  height: ${({ theme }) => theme.sizeUnit * 2}px;
  border-radius: 2px;
  background: ${({ gradient }) => gradient};
`;

const RangeWrap = styled.div`
  margin: 0 ${({ theme }) => theme.sizeUnit / 2}px;

  .ant-slider {
    margin: ${({ theme }) => theme.sizeUnit}px 0 0;
  }
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

export default function ColorLegend({
  legend,
  gradient,
  dimmed,
  onToggle,
  range,
  onRangeChange,
}: ColorLegendProps) {
  if (gradient) {
    return (
      <Wrap data-test="bim-legend">
        <Bar
          data-test="bim-legend-gradient"
          gradient={scaleCssGradient(gradient.scaleId)}
        />
        {onRangeChange && gradient.max > gradient.min && (
          <RangeWrap data-test="bim-legend-range">
            <Slider
              range
              min={gradient.min}
              max={gradient.max}
              value={range ?? [gradient.min, gradient.max]}
              onChange={value =>
                onRangeChange(value as unknown as [number, number])
              }
              tooltip={{ open: false }}
            />
          </RangeWrap>
        )}
        <Bounds>
          <span>{numberFmt.format(range?.[0] ?? gradient.min)}</span>
          <span>{numberFmt.format(range?.[1] ?? gradient.max)}</span>
        </Bounds>
      </Wrap>
    );
  }
  if (!legend.length) return null;
  return (
    <Wrap data-test="bim-legend">
      {legend.map(({ value, color }) => {
        const isDimmed = !!dimmed?.has(value);
        return (
          <Row
            key={value}
            type="button"
            dimmed={isDimmed}
            interactive={!!onToggle}
            aria-pressed={onToggle ? !isDimmed : undefined}
            data-test={`bim-legend-item-${value}`}
            onClick={onToggle ? () => onToggle(value) : undefined}
          >
            <Swatch color={color} dimmed={isDimmed} />
            <span>{value}</span>
          </Row>
        );
      })}
    </Wrap>
  );
}
