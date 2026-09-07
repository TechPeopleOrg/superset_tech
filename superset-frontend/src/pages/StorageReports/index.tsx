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
import { useCallback, useEffect, useState } from 'react';
import { useSelector } from 'react-redux';
import { t } from '@apache-superset/core/translation';
import { Alert } from '@apache-superset/core/components';
import { css, styled } from '@apache-superset/core/theme';
import { getClientErrorObject } from '@superset-ui/core';
import withToasts from 'src/components/MessageToasts/withToasts';
import {
  AsyncSelect,
  Button,
  DeleteModal,
  FormLabel,
  Input,
  Modal,
  Table,
  Tooltip,
  type ColumnsType,
} from '@superset-ui/core/components';
import { Icons } from '@superset-ui/core/components/Icons';
import SubMenu from 'src/features/home/SubMenu';
import { RootState } from 'src/dashboard/types';
import {
  StorageReport,
  fetchReports,
  updateReport,
  deleteReport,
  reportContentUrl,
  loadAssigneeOptions,
} from 'src/features/storageReports/api';
import { canView, canEdit, canDelete } from './permissions';

type AssigneeOption = { value: number; label: string };

interface ToastProps {
  addSuccessToast: (msg: string) => void;
  addDangerToast: (msg: string) => void;
}

interface EditState {
  ref: string;
  name: string;
  description: string;
  problemDate: string;
  // null means the report is deliberately unassigned.
  assignee: AssigneeOption | null;
}

const StyledContent = styled.div`
  ${({ theme }) => css`
    padding: ${theme.sizeUnit * 4}px;
  `}
`;

const StyledThumb = styled.img`
  ${({ theme }) => css`
    width: ${theme.sizeUnit * 20}px;
    height: ${theme.sizeUnit * 12}px;
    object-fit: cover;
    border-radius: ${theme.borderRadius}px;
    border: 1px solid ${theme.colorBorder};
    cursor: pointer;
  `}
`;

// Mirrors the Files page so both storage pages read the same way.
const StyledActions = styled.div`
  .action-button {
    display: inline-block;
    height: 100%;
    color: ${({ theme }) => theme.colorIcon};
    margin-right: ${({ theme }) => theme.sizeUnit * 2}px;

    &:last-of-type {
      margin-right: 0;
    }
  }
`;

// Long descriptions are clipped to keep the row height stable; the full text
// is one hover away, and the cell wraps to two lines before clipping.
const StyledClamp = styled.span`
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
  white-space: pre-wrap;
  word-break: break-word;
`;

const StyledPreview = styled.img`
  width: 100%;
  // Fits the tallest snapshot on screen without cropping or scrolling.
  max-height: 78vh;
  object-fit: contain;
`;

const StyledPreviewFooter = styled.div`
  ${({ theme }) => css`
    display: flex;
    justify-content: flex-end;
    padding-top: ${theme.sizeUnit * 2}px;
  `}
`;

// Dates and the author are short and fixed-width; without this the table
// squeezes them to "20..." to give the text columns room.
const StyledNoWrap = styled.span`
  white-space: nowrap;
`;

// The source is a plain object in metadata; render a link only when the
// dashboard/chart id was recorded.
const sourceLink = (report: StorageReport) => {
  const {
    source_type: type,
    source_id: id,
    source_name: name,
  } = report.metadata ?? {};
  if (!name) return null;
  if (type === 'dashboard' && id) {
    return <a href={`/superset/dashboard/${id}/`}>{name}</a>;
  }
  if (type === 'chart' && id) {
    return <a href={`/explore/?slice_id=${id}`}>{name}</a>;
  }
  return <span>{name}</span>;
};

function StorageReportsPage({ addSuccessToast, addDangerToast }: ToastProps) {
  const user = useSelector((state: RootState) => state.user);
  const [reports, setReports] = useState<StorageReport[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  const [editing, setEditing] = useState<EditState | null>(null);
  const [deleting, setDeleting] = useState<StorageReport | null>(null);
  const [previewing, setPreviewing] = useState<StorageReport | null>(null);

  const loadReports = useCallback(async () => {
    setLoading(true);
    try {
      setReports(await fetchReports());
      setError(false);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadReports();
  }, [loadReports]);

  const handleSaveEdit = async () => {
    if (!editing) return;
    try {
      await updateReport(editing.ref, {
        name: editing.name,
        metadata: {
          description: editing.description,
          problem_date: editing.problemDate,
          assignee: editing.assignee?.label ?? '',
          assignee_id: editing.assignee?.value,
        },
      });
      addSuccessToast(t('Report updated.'));
      setEditing(null);
      loadReports();
    } catch (err) {
      const { error: message } = await getClientErrorObject(err);
      addDangerToast(message || t('Updating the report failed.'));
    }
  };

  const handleDelete = async () => {
    if (!deleting) return;
    try {
      await deleteReport(deleting.uuid);
      addSuccessToast(t('Report deleted.'));
      setDeleting(null);
      loadReports();
    } catch (err) {
      const { error: message } = await getClientErrorObject(err);
      addDangerToast(message || t('Deleting the report failed.'));
    }
  };

  if (!canView(user)) {
    return (
      <div data-test="storage-reports-page">
        <SubMenu name={t('Report log')} />
        <StyledContent>
          <Alert type="error" closable={false}>
            {t("You don't have permission to view this page.")}
          </Alert>
        </StyledContent>
      </div>
    );
  }

  const columns: ColumnsType<StorageReport> = [
    {
      title: t('Preview'),
      key: 'preview',
      width: '8%',
      render: (_: unknown, report: StorageReport) => (
        <Tooltip id="preview-tooltip" title={t('Open the snapshot')}>
          <StyledThumb
            src={reportContentUrl(report.uuid)}
            alt={report.name}
            data-test={`preview-report-${report.uuid}`}
            onClick={() => setPreviewing(report)}
          />
        </Tooltip>
      ),
    },
    {
      title: t('Title'),
      key: 'name',
      width: '13%',
      render: (_: unknown, report: StorageReport) => (
        <Tooltip id="report-title-tooltip" title={report.name}>
          <StyledClamp>{report.name}</StyledClamp>
        </Tooltip>
      ),
    },
    {
      title: t('Problem description'),
      key: 'description',
      // The widest column: the description is the point of the log.
      width: '22%',
      render: (_: unknown, report: StorageReport) => {
        const text = report.metadata?.description ?? '';
        if (!text) return '';
        return (
          <Tooltip id="report-description-tooltip" title={text}>
            <StyledClamp>{text}</StyledClamp>
          </Tooltip>
        );
      },
    },
    {
      title: t('Date observed'),
      key: 'problem_date',
      width: '11%',
      // Sorted by the observed date rather than the upload time: that is the
      // date the log is actually about.
      sorter: (a: StorageReport, b: StorageReport) =>
        (a.metadata?.problem_date ?? '').localeCompare(
          b.metadata?.problem_date ?? '',
        ),
      render: (_: unknown, report: StorageReport) => (
        <StyledNoWrap>{report.metadata?.problem_date ?? ''}</StyledNoWrap>
      ),
    },
    {
      title: t('Source'),
      key: 'source',
      width: '12%',
      render: (_: unknown, report: StorageReport) => (
        <Tooltip
          id="report-source-tooltip"
          title={report.metadata?.source_name ?? ''}
        >
          <StyledClamp>{sourceLink(report)}</StyledClamp>
        </Tooltip>
      ),
    },
    {
      title: t('Author'),
      key: 'author',
      width: '9%',
      render: (_: unknown, report: StorageReport) => (
        <StyledClamp>{report.metadata?.author ?? ''}</StyledClamp>
      ),
    },
    {
      title: t('Assigned to'),
      key: 'assignee',
      width: '11%',
      render: (_: unknown, report: StorageReport) => (
        <StyledClamp>{report.metadata?.assignee ?? ''}</StyledClamp>
      ),
    },
    {
      title: t('Saved'),
      key: 'created_at',
      width: '8%',
      render: (_: unknown, report: StorageReport) => (
        <StyledNoWrap>
          {report.created_at ? report.created_at.slice(0, 10) : ''}
        </StyledNoWrap>
      ),
    },
    {
      title: t('Actions'),
      key: 'actions',
      width: '6%',
      render: (_: unknown, report: StorageReport) => (
        <StyledActions>
          {canEdit(user) && (
            <Tooltip id="edit-action-tooltip" title={t('Edit')}>
              <span
                data-test={`edit-report-${report.uuid}`}
                role="button"
                tabIndex={0}
                className="action-button"
                onClick={() =>
                  setEditing({
                    ref: report.uuid,
                    name: report.name,
                    description: report.metadata?.description ?? '',
                    problemDate: report.metadata?.problem_date ?? '',
                    assignee:
                      report.metadata?.assignee && report.metadata?.assignee_id
                        ? {
                            value: report.metadata.assignee_id,
                            label: report.metadata.assignee,
                          }
                        : null,
                  })
                }
              >
                <Icons.EditOutlined iconSize="l" />
              </span>
            </Tooltip>
          )}
          {canDelete(user) && (
            <Tooltip id="delete-action-tooltip" title={t('Delete')}>
              <span
                data-test={`delete-report-${report.uuid}`}
                role="button"
                tabIndex={0}
                className="action-button"
                onClick={() => setDeleting(report)}
              >
                <Icons.DeleteOutlined iconSize="l" />
              </span>
            </Tooltip>
          )}
        </StyledActions>
      ),
    },
  ];

  return (
    <div data-test="storage-reports-page">
      <SubMenu name={t('Report log')} />
      <StyledContent>
        {error && (
          <Alert
            type="error"
            closable={false}
            description={
              <Button
                data-test="retry-btn"
                buttonStyle="link"
                onClick={loadReports}
              >
                {t('Retry')}
              </Button>
            }
          >
            {t(
              'File storage is currently unavailable. Please try again later.',
            )}
          </Alert>
        )}
        {!error && (
          <Table<StorageReport>
            rowKey="uuid"
            columns={columns}
            data={reports}
            loading={loading}
          />
        )}
      </StyledContent>

      {previewing && (
        <Modal
          show
          onHide={() => setPreviewing(null)}
          title={previewing.name}
          hideFooter
          responsive
          centered
          width="90vw"
          maxWidth="1800px"
        >
          <StyledPreview
            src={reportContentUrl(previewing.uuid)}
            alt={previewing.name}
          />
          <StyledPreviewFooter>
            {/* Escape hatch for reading fine print: the raw image at 100%. */}
            <Button
              buttonStyle="link"
              onClick={() =>
                window.open(reportContentUrl(previewing.uuid), '_blank')
              }
            >
              {t('Open at full size')}
            </Button>
          </StyledPreviewFooter>
        </Modal>
      )}

      {editing && (
        <Modal
          show
          onHide={() => setEditing(null)}
          title={t('Edit report')}
          primaryButtonName={t('Save')}
          onHandledPrimaryAction={handleSaveEdit}
        >
          <div
            css={css`
              display: flex;
              flex-direction: column;
              gap: 16px;
            `}
          >
            <div>
              <FormLabel htmlFor="edit-report-name">{t('Title')}</FormLabel>
              <Input
                id="edit-report-name"
                value={editing.name}
                onChange={e => setEditing({ ...editing, name: e.target.value })}
              />
            </div>
            <div>
              <FormLabel htmlFor="edit-report-description">
                {t('Problem description')}
              </FormLabel>
              <Input.TextArea
                id="edit-report-description"
                rows={4}
                value={editing.description}
                onChange={e =>
                  setEditing({ ...editing, description: e.target.value })
                }
              />
            </div>
            <div>
              <FormLabel htmlFor="edit-report-assignee">
                {t('Assigned to')}
              </FormLabel>
              <AsyncSelect
                ariaLabel={t('Assigned to')}
                name="edit-report-assignee"
                data-test="edit-report-assignee"
                allowClear
                placeholder={t('No one assigned')}
                value={editing.assignee ?? undefined}
                options={loadAssigneeOptions}
                onChange={value =>
                  setEditing({
                    ...editing,
                    assignee: (value as AssigneeOption | undefined) ?? null,
                  })
                }
                onClear={() => setEditing({ ...editing, assignee: null })}
              />
            </div>
            <div>
              <FormLabel htmlFor="edit-report-date">
                {t('Date observed')}
              </FormLabel>
              <Input
                id="edit-report-date"
                type="date"
                value={editing.problemDate}
                onChange={e =>
                  setEditing({ ...editing, problemDate: e.target.value })
                }
              />
            </div>
          </div>
        </Modal>
      )}

      {deleting && (
        <DeleteModal
          description={t(
            'This will permanently delete the report and its snapshot.',
          )}
          onConfirm={handleDelete}
          onHide={() => setDeleting(null)}
          open
          title={t('Delete report?')}
        />
      )}
    </div>
  );
}

export default withToasts(StorageReportsPage);
