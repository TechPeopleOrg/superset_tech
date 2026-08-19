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
import { styled } from '@apache-superset/core/theme';
import { Button, Icons, Slider, Tooltip } from '@superset-ui/core/components';
import type { ModelBounds, SectionAxis } from './types';

export interface SectionPanelProps {
  bounds?: ModelBounds;
  axis: SectionAxis | null;
  position: number;
  flipped: boolean;
  onAxisChange: (axis: SectionAxis | null) => void;
  onPositionChange: (position: number) => void;
  onFlip: () => void;
  onReset: () => void;
  onClose: () => void;
}

const Panel = styled.div`
  position: absolute;
  top: ${({ theme }) => theme.sizeUnit * 14}px;
  left: 50%;
  transform: translateX(-50%);
  z-index: 10;
  width: ${({ theme }) => theme.sizeUnit * 70}px;
  padding: ${({ theme }) => theme.sizeUnit * 3}px;
  background: ${({ theme }) => theme.colorBgElevated};
  border: 1px solid ${({ theme }) => theme.colorBorderSecondary};
  border-radius: ${({ theme }) => theme.borderRadius}px;
  box-shadow: ${({ theme }) => theme.boxShadowSecondary};
  pointer-events: auto;
`;

const Header = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: ${({ theme }) => theme.sizeUnit * 2}px;
  font-size: ${({ theme }) => theme.fontSizeSM}px;
  font-weight: ${({ theme }) => theme.fontWeightStrong};
  color: ${({ theme }) => theme.colorText};
`;

const CloseButton = styled.button`
  display: inline-flex;
  padding: 0;
  cursor: pointer;
  border: none;
  background: transparent;
  color: ${({ theme }) => theme.colorTextTertiary};

  &:hover {
    color: ${({ theme }) => theme.colorText};
  }
`;

const AxisRow = styled.div`
  display: flex;
  gap: ${({ theme }) => theme.sizeUnit}px;
  margin-bottom: ${({ theme }) => theme.sizeUnit * 2}px;
`;

const AxisButton = styled.button<{ active?: boolean }>`
  flex: 1;
  padding: ${({ theme }) => theme.sizeUnit}px 0;
  cursor: pointer;
  font-size: ${({ theme }) => theme.fontSizeSM}px;
  border: 1px solid
    ${({ theme, active }) =>
      active ? theme.colorPrimary : theme.colorBorderSecondary};
  border-radius: ${({ theme }) => theme.borderRadius}px;
  color: ${({ theme, active }) =>
    active ? theme.colorPrimary : theme.colorTextSecondary};
  background: ${({ theme, active }) =>
    active ? theme.controlItemBgActive : 'transparent'};

  &:hover {
    color: ${({ theme }) => theme.colorText};
    border-color: ${({ theme }) => theme.colorBorder};
  }

  &:focus-visible {
    outline: 2px solid ${({ theme }) => theme.colorPrimary};
    outline-offset: 1px;
  }
`;

const ValueRow = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-top: ${({ theme }) => theme.sizeUnit}px;
  font-size: ${({ theme }) => theme.fontSizeSM}px;
  color: ${({ theme }) => theme.colorTextTertiary};
`;

const Actions = styled.div`
  display: flex;
  align-items: center;
  gap: ${({ theme }) => theme.sizeUnit}px;
`;

const ResetButton = styled.button`
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: ${({ theme }) => theme.sizeUnit * 6}px;
  height: ${({ theme }) => theme.sizeUnit * 6}px;
  padding: 0;
  cursor: pointer;
  border: none;
  border-radius: ${({ theme }) => theme.borderRadius}px;
  color: ${({ theme }) => theme.colorTextSecondary};
  background: transparent;

  &:hover {
    color: ${({ theme }) => theme.colorText};
    background: ${({ theme }) => theme.colorBgTextHover};
  }

  &:focus-visible {
    outline: 2px solid ${({ theme }) => theme.colorPrimary};
    outline-offset: 1px;
  }
`;

const Hint = styled.div`
  font-size: ${({ theme }) => theme.fontSizeSM}px;
  color: ${({ theme }) => theme.colorTextTertiary};
`;

const AXES: { id: SectionAxis; label: string; hint: string }[] = [
  { id: 'x', label: t('X'), hint: t('Vertical cut across the model') },
  { id: 'y', label: t('Y'), hint: t('Horizontal cut by elevation') },
];

const SLIDER_STEPS = 200;

export default function SectionPanel({
  bounds,
  axis,
  position,
  flipped,
  onAxisChange,
  onPositionChange,
  onFlip,
  onReset,
  onClose,
}: SectionPanelProps) {
  const range = axis && bounds ? bounds[axis] : undefined;
  const step = range ? Math.max((range[1] - range[0]) / SLIDER_STEPS, 1) : 1;

  return (
    <Panel data-test="bim-section-panel">
      <Header>
        {t('Section')}
        <CloseButton
          type="button"
          aria-label={t('Close section panel')}
          data-test="bim-section-close"
          onClick={onClose}
        >
          <Icons.CloseOutlined iconSize="s" />
        </CloseButton>
      </Header>
      <AxisRow>
        {AXES.map(a => (
          <Tooltip key={a.id} title={a.hint}>
            <AxisButton
              type="button"
              active={axis === a.id}
              aria-pressed={axis === a.id}
              data-test={`bim-section-axis-${a.id}`}
              onClick={() => onAxisChange(axis === a.id ? null : a.id)}
            >
              {a.label}
            </AxisButton>
          </Tooltip>
        ))}
      </AxisRow>
      {!bounds && <Hint>{t('Waiting for the model…')}</Hint>}
      {bounds && !axis && <Hint>{t('Pick an axis to cut along.')}</Hint>}
      {bounds && axis && range && (
        <>
          <Slider
            min={range[0]}
            max={range[1]}
            step={step}
            value={position}
            tooltip={{ open: false }}
            aria-label={t('Section position')}
            data-test="bim-section-slider"
            onChange={onPositionChange}
          />
          <ValueRow>
            <span data-test="bim-section-value">{Math.round(position)}</span>
            <Actions>
              <Tooltip title={t('Reset section')}>
                <ResetButton
                  type="button"
                  aria-label={t('Reset section')}
                  data-test="bim-section-reset"
                  onClick={onReset}
                >
                  <Icons.ReloadOutlined iconSize="s" />
                </ResetButton>
              </Tooltip>
              <Button
                buttonSize="xsmall"
                buttonStyle="tertiary"
                data-test="bim-section-flip"
                onClick={onFlip}
              >
                {flipped ? t('Flip back') : t('Flip')}
              </Button>
            </Actions>
          </ValueRow>
        </>
      )}
    </Panel>
  );
}
