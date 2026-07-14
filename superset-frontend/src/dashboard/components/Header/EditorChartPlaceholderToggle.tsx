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
import { useCallback } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { t } from '@apache-superset/core/translation';
import { Switch, Tooltip } from '@superset-ui/core/components';
import { setEditorChartPlaceholders } from 'src/dashboard/actions/dashboardState';

interface PlaceholderToggleState {
  dashboardState: { editorChartPlaceholders?: boolean };
}

export default function EditorChartPlaceholderToggle() {
  const dispatch = useDispatch();
  const placeholders = useSelector(
    (state: PlaceholderToggleState) =>
      !!state.dashboardState.editorChartPlaceholders,
  );
  const handleChange = useCallback(
    (checked: boolean) => {
      dispatch(setEditorChartPlaceholders(checked));
    },
    [dispatch],
  );

  return (
    <Tooltip
      id="editor-chart-placeholder-tooltip"
      title={t(
        'Edit layout with lightweight chart placeholders instead of rendered charts (no data is queried)',
      )}
    >
      <Switch
        checked={placeholders}
        onChange={handleChange}
        checkedChildren={t('Layout')}
        unCheckedChildren={t('Data')}
        data-test="editor-chart-placeholder-toggle"
      />
    </Tooltip>
  );
}
