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
import { DataRecord } from '@superset-ui/core';
import { t } from '@apache-superset/core/translation';
import { styled } from '@apache-superset/core/theme';
import { Button, Icons } from '@superset-ui/core/components';
import type { ObjectInfo } from './types';

const PANEL_WIDTH = 280;

// Right-hand counterpart to the model tree, which owns the left edge.
const Panel = styled.div`
  position: absolute;
  top: 0;
  right: 0;
  width: ${PANEL_WIDTH}px;
  height: 100%;
  z-index: 20;
  display: flex;
  flex-direction: column;
  padding: ${({ theme }) => theme.sizeUnit * 2}px;
  gap: ${({ theme }) => theme.sizeUnit}px;
  background: ${({ theme }) => theme.colorBgContainer};
  border-left: 1px solid ${({ theme }) => theme.colorBorder};
  overflow: hidden;
`;

const Header = styled.div`
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: ${({ theme }) => theme.sizeUnit}px;
`;

const Title = styled.div`
  font-weight: ${({ theme }) => theme.fontWeightStrong};
  word-break: break-word;
`;

const TypeLabel = styled.div`
  font-size: ${({ theme }) => theme.fontSizeSM}px;
  color: ${({ theme }) => theme.colorTextTertiary};
`;

// Scrolls independently of the header.
const Body = styled.div`
  flex: 1;
  min-height: 0;
  overflow-y: auto;
`;

const SectionTitle = styled.div`
  margin: ${({ theme }) => theme.sizeUnit * 2}px 0
    ${({ theme }) => theme.sizeUnit}px;
  font-size: ${({ theme }) => theme.fontSizeSM}px;
  font-weight: ${({ theme }) => theme.fontWeightStrong};
  color: ${({ theme }) => theme.colorTextSecondary};
  text-transform: uppercase;
`;

// minmax(0,…) lets long values wrap instead of widening the panel.
const Row = styled.div`
  display: grid;
  grid-template-columns: minmax(0, 2fr) minmax(0, 3fr);
  gap: ${({ theme }) => theme.sizeUnit}px;
  padding: ${({ theme }) => theme.sizeUnit / 2}px 0;
  font-size: ${({ theme }) => theme.fontSizeSM}px;
  border-bottom: 1px solid ${({ theme }) => theme.colorBorderSecondary};
`;

const Key = styled.div`
  color: ${({ theme }) => theme.colorTextTertiary};
  word-break: break-word;
`;

const Value = styled.div`
  word-break: break-word;
`;

const Note = styled.div`
  font-size: ${({ theme }) => theme.fontSizeSM}px;
  color: ${({ theme }) => theme.colorTextTertiary};
  font-style: italic;
`;

// Empty values read as a dash rather than a layout gap.
function formatValue(value: unknown): string {
  if (value === null || value === undefined || value === '') return '—';
  if (value instanceof Date) return value.toISOString();
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}

export interface ObjectPropertiesProps {
  info: ObjectInfo;
  row?: DataRecord;
  // Ancestor the row came from, when the element had no row of its own.
  inheritedFrom?: string;
  onClose: () => void;
}

export default function ObjectProperties({
  info,
  row,
  inheritedFrom,
  onClose,
}: ObjectPropertiesProps) {
  const entries = row ? Object.entries(row) : [];

  return (
    <Panel data-test="bim-object-properties">
      <Header>
        <div>
          <Title data-test="bim-props-name">{info.name}</Title>
          {info.type && <TypeLabel>{info.type}</TypeLabel>}
        </div>
        <Button
          buttonSize="xsmall"
          buttonStyle="tertiary"
          data-test="bim-props-close"
          aria-label={t('Close properties')}
          onClick={onClose}
          icon={<Icons.CloseOutlined />}
        />
      </Header>

      <Body>
        <SectionTitle>{t('Element')}</SectionTitle>
        <Row>
          <Key>{t('GlobalId')}</Key>
          <Value>{info.id}</Value>
        </Row>
        {info.path.length > 0 && (
          <Row data-test="bim-props-path">
            <Key>{t('Location')}</Key>
            <Value>{info.path.join(' / ')}</Value>
          </Row>
        )}

        <SectionTitle>{t('Data')}</SectionTitle>
        {inheritedFrom && (
          <Note data-test="bim-props-inherited">
            {t('Inherited from %s', inheritedFrom)}
          </Note>
        )}
        {entries.length === 0 ? (
          <Note data-test="bim-props-no-data">
            {t('No data row matches this element.')}
          </Note>
        ) : (
          entries.map(([key, value]) => (
            <Row key={key}>
              <Key>{key}</Key>
              <Value data-test={`bim-props-value-${key}`}>
                {formatValue(value)}
              </Value>
            </Row>
          ))
        )}
      </Body>
    </Panel>
  );
}
