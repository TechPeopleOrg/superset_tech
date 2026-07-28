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
import { Icons, Tooltip } from '@superset-ui/core/components';
import type { NavMode } from './useXeokitViewer';

export interface ViewerControlsProps {
  // Active navigation mode; the matching toggle reads as pressed.
  navMode: NavMode;
  // Called with the chosen mode when a navigation toggle is clicked.
  onNavModeChange: (mode: NavMode) => void;
  // Called when the "fit to view" action is clicked.
  onFit: () => void;
  // Whether the model tree panel is open (drives the tree toggle's state).
  // Omit to hide the tree toggle entirely (e.g. no tree available).
  treeOpen?: boolean;
  // Called when the tree toggle is clicked. When omitted, the toggle is hidden.
  onToggleTree?: () => void;
}

// A floating toolbar pinned to the top-center of the viewer, above the scene.
// pointer-events is re-enabled on the bar itself so it stays clickable while
// the wrapper doesn't block interaction with the model around it.
const Bar = styled.div`
  position: absolute;
  top: ${({ theme }) => theme.sizeUnit * 2}px;
  left: 50%;
  transform: translateX(-50%);
  z-index: 10;
  display: flex;
  align-items: center;
  gap: ${({ theme }) => theme.sizeUnit}px;
  padding: ${({ theme }) => theme.sizeUnit}px;
  background: ${({ theme }) => theme.colorBgElevated};
  border: 1px solid ${({ theme }) => theme.colorBorderSecondary};
  border-radius: ${({ theme }) => theme.borderRadius}px;
  box-shadow: ${({ theme }) => theme.boxShadowSecondary};
  pointer-events: auto;
`;

// A thin divider between the mode toggle group and the fit action.
const Divider = styled.span`
  width: 1px;
  align-self: stretch;
  margin: 0 ${({ theme }) => theme.sizeUnit / 2}px;
  background: ${({ theme }) => theme.colorBorderSecondary};
`;

// Square icon button. The `active` state is the toolbar's one expressive
// signal: it fills with the primary accent so the bar always shows which
// navigation mode is live — something the static control-panel toggles cannot.
const IconButton = styled.button<{ active?: boolean }>`
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: ${({ theme }) => theme.sizeUnit * 7}px;
  height: ${({ theme }) => theme.sizeUnit * 7}px;
  padding: 0;
  cursor: pointer;
  border: none;
  border-radius: ${({ theme }) => theme.borderRadius}px;
  color: ${({ theme, active }) =>
    active ? theme.colorPrimary : theme.colorTextSecondary};
  background: transparent;
  transition:
    background 120ms ease,
    color 120ms ease;

  &[aria-pressed='true'] {
    background: ${({ theme }) => theme.controlItemBgActive};
  }

  &:hover {
    background: ${({ theme }) => theme.colorBgTextHover};
    color: ${({ theme }) => theme.colorText};
  }

  &[aria-pressed='true']:hover {
    background: ${({ theme }) => theme.controlItemBgActive};
    color: ${({ theme }) => theme.colorPrimary};
  }

  &:focus-visible {
    outline: 2px solid ${({ theme }) => theme.colorPrimary};
    outline-offset: 1px;
  }
`;

export default function ViewerControls({
  navMode,
  onNavModeChange,
  onFit,
  treeOpen,
  onToggleTree,
}: ViewerControlsProps) {
  return (
    <Bar data-test="bim-viewer-controls">
      {onToggleTree && (
        <>
          <Tooltip title={t('Model tree')}>
            <IconButton
              type="button"
              active={treeOpen}
              aria-pressed={!!treeOpen}
              aria-label={t('Model tree')}
              data-test="bim-tree-toggle"
              onClick={onToggleTree}
            >
              <Icons.ApartmentOutlined />
            </IconButton>
          </Tooltip>
          <Divider />
        </>
      )}
      <Tooltip title={t('Orbit')}>
        <IconButton
          type="button"
          active={navMode === 'orbit'}
          aria-pressed={navMode === 'orbit'}
          aria-label={t('Orbit')}
          data-test="bim-nav-orbit"
          onClick={() => onNavModeChange('orbit')}
        >
          <Icons.SyncOutlined />
        </IconButton>
      </Tooltip>
      <Tooltip title={t('First person')}>
        <IconButton
          type="button"
          active={navMode === 'firstPerson'}
          aria-pressed={navMode === 'firstPerson'}
          aria-label={t('First person')}
          data-test="bim-nav-first-person"
          onClick={() => onNavModeChange('firstPerson')}
        >
          <Icons.UserOutlined />
        </IconButton>
      </Tooltip>
      <Divider />
      <Tooltip title={t('Fit to view')}>
        <IconButton
          type="button"
          aria-label={t('Fit to view')}
          data-test="bim-fit"
          onClick={onFit}
        >
          <Icons.FullscreenOutlined />
        </IconButton>
      </Tooltip>
    </Bar>
  );
}
