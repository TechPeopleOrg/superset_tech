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
import { useEffect, useState } from 'react';
import { t } from '@apache-superset/core/translation';
import { css } from '@apache-superset/core/theme';
import { getClientErrorObject } from '@superset-ui/core';
import {
  AsyncSelect,
  FormLabel,
  Input,
  Modal,
  Select,
} from '@superset-ui/core/components';
import { ReportSource, loadAssigneeOptions, saveReport } from './api';

type AssigneeOption = { value: number; label: string };

// Local calendar day as YYYY-MM-DD. toISOString() would shift the date across
// the day boundary for anyone east or west of UTC.
export const todayIsoDate = (date = new Date()): string => {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
};

export interface SaveReportModalProps {
  show: boolean;
  onHide: () => void;
  // Produces the snapshot. Called on submit, so the capture cost is only paid
  // once the user has actually committed to saving.
  // Takes the chosen scope: the whole page, or only what is on screen.
  capture: (fullPage: boolean) => Promise<{
    dataUrl: string;
    fileName: string;
  }>;
  source: ReportSource;
  addSuccessToast?: (msg: string) => void;
  addDangerToast?: (msg: string) => void;
}

export default function SaveReportModal({
  show,
  onHide,
  capture,
  source,
  addSuccessToast,
  addDangerToast,
}: SaveReportModalProps) {
  const [name, setName] = useState(source.name);
  const [description, setDescription] = useState('');
  const [problemDate, setProblemDate] = useState(todayIsoDate());
  // Empty by default: a report may be filed before anyone is assigned.
  const [assignee, setAssignee] = useState<AssigneeOption | null>(null);
  // Whole page by default: a report is usually about the view as a whole.
  // Kept as a string because the Select works in string/number values.
  const [scope, setScope] = useState<'full' | 'visible'>('full');
  const [saving, setSaving] = useState(false);

  // Reset to a clean form each time the dialog opens, so a previous report's
  // text is never silently reused.
  useEffect(() => {
    if (show) {
      setName(source.name);
      setDescription('');
      setProblemDate(todayIsoDate());
      setAssignee(null);
      setScope('full');
      setSaving(false);
    }
  }, [show, source.name]);

  const handleSave = async () => {
    setSaving(true);
    try {
      const { dataUrl, fileName } = await capture(scope === 'full');
      await saveReport({
        dataUrl,
        fileName,
        name: name.trim() || source.name,
        description: description.trim(),
        problemDate,
        source,
        assignee,
      });
      addSuccessToast?.(t('Report saved to the report log.'));
      onHide();
    } catch (error) {
      const { error: message } = await getClientErrorObject(error);
      addDangerToast?.(message || t('Saving the report failed.'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      show={show}
      onHide={onHide}
      title={t('New report')}
      primaryButtonName={saving ? t('Saving...') : t('Save')}
      disablePrimaryButton={saving || description.trim().length === 0}
      onHandledPrimaryAction={handleSave}
    >
      <div
        css={css`
          display: flex;
          flex-direction: column;
          gap: 16px;
        `}
      >
        <div>
          <FormLabel htmlFor="report-name">{t('Title')}</FormLabel>
          <Input
            id="report-name"
            data-test="report-name"
            value={name}
            onChange={e => setName(e.target.value)}
            placeholder={source.name}
          />
        </div>
        <div>
          <FormLabel htmlFor="report-description" required>
            {t('Problem description')}
          </FormLabel>
          <Input.TextArea
            id="report-description"
            data-test="report-description"
            rows={4}
            value={description}
            onChange={e => setDescription(e.target.value)}
            placeholder={t('What is wrong, and where?')}
          />
        </div>
        <div>
          <FormLabel htmlFor="report-assignee">{t('Assigned to')}</FormLabel>
          <AsyncSelect
            ariaLabel={t('Assigned to')}
            name="report-assignee"
            data-test="report-assignee"
            allowClear
            placeholder={t('No one assigned')}
            value={assignee ?? undefined}
            options={loadAssigneeOptions}
            onChange={value =>
              setAssignee((value as AssigneeOption | undefined) ?? null)
            }
            onClear={() => setAssignee(null)}
          />
        </div>
        <div>
          <FormLabel htmlFor="report-scope">{t('Snapshot area')}</FormLabel>
          <Select
            ariaLabel={t('Snapshot area')}
            name="report-scope"
            data-test="report-scope"
            value={scope}
            onChange={value => setScope(value as 'full' | 'visible')}
            options={[
              { value: 'full', label: t('Whole page') },
              { value: 'visible', label: t('Visible area only') },
            ]}
          />
        </div>
        <div>
          <FormLabel htmlFor="report-date">{t('Date observed')}</FormLabel>
          <Input
            id="report-date"
            data-test="report-date"
            type="date"
            value={problemDate}
            onChange={e => setProblemDate(e.target.value)}
          />
        </div>
      </div>
    </Modal>
  );
}
