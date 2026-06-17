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
// Literal colors here are user color *data* (the default swatch and the live
// preview of the user's chosen CSS color), not theme styling.
/* eslint-disable theme-colors/no-literal-colors */
import { ReactNode } from 'react';
import { t } from '@apache-superset/core/translation';
import { Button, Input, Space } from '@superset-ui/core/components';
import { Icons } from '@superset-ui/core/components/Icons';
import { SvgStatusColor } from './types';

export interface StatusColorControlProps {
  value?: SvgStatusColor[];
  // The second argument carries validation errors back to the control runner
  // (see Control.tsx), which surfaces them in the panel.
  onChange?: (value: SvgStatusColor[], errors: string[]) => void;
  label?: ReactNode;
  description?: ReactNode;
}

// A row is invalid when exactly one of its two fields is filled in. Fully empty
// rows are tolerated (a freshly added, untouched row) and fully filled rows are
// valid.
function isIncomplete(row: SvgStatusColor): boolean {
  const hasStatus = Boolean(row.status?.trim());
  const hasColor = Boolean(row.color?.trim());
  return hasStatus !== hasColor;
}

function collectErrors(rows: SvgStatusColor[]): string[] {
  return rows.some(isIncomplete)
    ? [t('Each status color needs both a status and a color.')]
    : [];
}

/**
 * A small repeatable list of `status -> color` rows. Each row holds a free-text
 * status label and a CSS color string (hex/rgb/named). The value is the raw
 * array consumed by SVGCore's `colorStatus` option.
 */
export default function StatusColorControl({
  value = [],
  onChange,
  label,
}: StatusColorControlProps) {
  const update = (next: SvgStatusColor[]) =>
    onChange?.(next, collectErrors(next));

  const updateRow = (index: number, patch: Partial<SvgStatusColor>) =>
    update(value.map((row, i) => (i === index ? { ...row, ...patch } : row)));

  const removeRow = (index: number) =>
    update(value.filter((_, i) => i !== index));

  const addRow = () => update([...value, { status: '', color: '#cccccc' }]);

  return (
    <div className="ControlHeader">
      {label && <div className="pull-left">{label}</div>}
      <Space direction="vertical" size="small" style={{ width: '100%' }}>
        {value.map((row, index) => {
          const incomplete = isIncomplete(row);
          return (
            // Index keys are acceptable here: rows are reordered only by
            // add/remove at the end, not drag-sorted.
            // eslint-disable-next-line react/no-array-index-key
            <Space key={index} align="center" style={{ width: '100%' }}>
              <Input
                placeholder={t('Status')}
                value={row.status}
                status={incomplete && !row.status?.trim() ? 'error' : undefined}
                onChange={e => updateRow(index, { status: e.target.value })}
              />
              <Input
                placeholder={t('Color, e.g. #20a8c9')}
                value={row.color}
                status={incomplete && !row.color?.trim() ? 'error' : undefined}
                onChange={e => updateRow(index, { color: e.target.value })}
              />
              <span
                aria-hidden
                style={{
                  display: 'inline-block',
                  width: 16,
                  height: 16,
                  borderRadius: 2,
                  border: '1px solid rgba(0,0,0,0.2)',
                  background: row.color || 'transparent',
                }}
              />
              <Button
                buttonStyle="link"
                onClick={() => removeRow(index)}
                aria-label={t('Remove item')}
              >
                <Icons.CloseOutlined iconSize="m" />
              </Button>
            </Space>
          );
        })}
        <Button buttonStyle="link" onClick={addRow}>
          <Icons.PlusOutlined iconSize="m" /> {t('Add status color')}
        </Button>
      </Space>
    </div>
  );
}
