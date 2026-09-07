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
import { useCallback, useState } from 'react';
import { t } from '@apache-superset/core/translation';
import { kebabCase } from 'lodash';
import {
  captureElementAsDataUrl,
  captureFileExtension,
} from 'src/utils/downloadAsImage';
import { ReportSource } from './api';
import SaveReportModal, { todayIsoDate } from './SaveReportModal';

export interface SaveReportMenuItemProps {
  // CSS selector for the element to snapshot (the dashboard root, or a chart).
  selector: string;
  source: ReportSource;
  addSuccessToast?: (msg: string) => void;
  addDangerToast?: (msg: string) => void;
}

/**
 * Menu entry that snapshots the dashboard or chart and saves it to the report
 * log with a description and a date.
 *
 * Rendered as the `label` of a menu item, following the same pattern as the
 * other modal-backed entries in the dashboard header menu.
 */
export default function SaveReportMenuItem({
  selector,
  source,
  addSuccessToast,
  addDangerToast,
}: SaveReportMenuItemProps) {
  const [show, setShow] = useState(false);

  const capture = useCallback(
    async (fullPage: boolean) => {
      const element = document.querySelector(selector);
      if (!element) {
        throw new Error(t('Nothing to capture. Please refresh and try again.'));
      }
      // The dropdown closes on a delay and would otherwise land in the snapshot,
      // so hide it for the duration of the capture (same trick as the image
      // download path in SliceHeaderControls).
      const menu = document.querySelector(
        '.ant-dropdown:not(.ant-dropdown-hidden)',
      ) as HTMLElement | null;
      if (menu) {
        menu.style.visibility = 'hidden';
      }
      try {
        // PNG rather than the JPEG used for downloads: chart text and thin lines
        // stay legible, which matters when the snapshot is the evidence.
        // "Visible area only" renders the live view as it stands; the whole-page
        // scope goes through the clone path, which reaches scrolled-out rows.
        const dataUrl = await captureElementAsDataUrl(
          element,
          'png',
          undefined,
          { visibleOnly: !fullPage },
        );
        const stem = kebabCase(source.name) || 'report';
        return {
          dataUrl,
          fileName: `${stem}-${todayIsoDate()}.${captureFileExtension('png')}`,
        };
      } finally {
        if (menu) {
          menu.style.visibility = 'visible';
        }
      }
    },
    [selector, source.name],
  );

  return (
    <>
      <div
        role="button"
        tabIndex={0}
        data-test="save-report-menu-item"
        onClick={() => setShow(true)}
        onKeyPress={() => setShow(true)}
      >
        {t('Add to report log')}
      </div>
      <SaveReportModal
        show={show}
        onHide={() => setShow(false)}
        capture={capture}
        source={source}
        addSuccessToast={addSuccessToast}
        addDangerToast={addDangerToast}
      />
    </>
  );
}
