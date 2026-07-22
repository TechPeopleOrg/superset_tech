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
import { useEffect, useMemo, useRef, useState } from 'react';
import { t } from '@apache-superset/core/translation';
import { styled, useTheme } from '@apache-superset/core/theme';
import { Alert } from '@apache-superset/core/components';
import { Button, Loading } from '@superset-ui/core/components';
import useXeokitViewer from './useXeokitViewer';
import ModelTree from './ModelTree';
import buildColorMapping, { hexToRgb01 } from './colorMapping';
import ColorLegend from './ColorLegend';
import { BimChartProps } from './types';

const Container = styled.div`
  position: relative;
  overflow: hidden;
`;

const Center = styled.div`
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: ${({ theme }) => theme.sizeUnit * 4}px;
  text-align: center;
  color: ${({ theme }) => theme.colorTextTertiary};
`;

const Diagnostic = styled.div`
  position: absolute;
  left: ${({ theme }) => theme.sizeUnit * 2}px;
  bottom: ${({ theme }) => theme.sizeUnit * 2}px;
  z-index: 10;
  padding: ${({ theme }) => theme.sizeUnit}px
    ${({ theme }) => theme.sizeUnit * 2}px;
  font-size: ${({ theme }) => theme.fontSizeSM}px;
  color: ${({ theme }) => theme.colorTextTertiary};
  background: ${({ theme }) => theme.colorBgContainer};
  border-radius: ${({ theme }) => theme.borderRadius}px;
`;

export default function BimChart(props: BimChartProps) {
  const {
    width,
    height,
    modelUrl,
    backgroundColor,
    showEdges,
    navMode,
    rows,
    linkColumn,
    colorBy,
    colorFn,
    overrides,
  } = props;
  const theme = useTheme();
  const containerRef = useRef<HTMLDivElement>(null);
  // Bump to force the hook effect to re-run on retry without changing modelUrl.
  const [retryKey, setRetryKey] = useState(0);

  const { loading, error, tree, api } = useXeokitViewer(containerRef, {
    modelUrl: modelUrl ? `${modelUrl}#${retryKey}` : '',
    backgroundColor,
    showEdges,
    navMode,
  });

  // Value -> color mapping derived from the query rows; empty when the chart
  // isn't configured for data-binding yet (no link/color-by column chosen).
  const { colorById, legend } = useMemo(() => {
    if (!linkColumn || !colorBy) {
      return {
        colorById: new Map<string, [number, number, number]>(),
        legend: [] as { value: string; color: string }[],
      };
    }
    return buildColorMapping({ rows, linkColumn, colorBy, colorFn, overrides });
  }, [rows, linkColumn, colorBy, colorFn, overrides]);

  const [matched, setMatched] = useState<{ m: number; n: number } | null>(null);

  // Paint the scene whenever the mapping or the live api changes: reset to a
  // neutral base (so unmatched elements read as "no data"), then paint every
  // matched GlobalId's geometry leaves with its mapped color.
  useEffect(() => {
    if (!api || !colorById.size) {
      setMatched(null);
      return;
    }
    api.resetColors();
    const neutral = hexToRgb01(theme.colorFillSecondary ?? '#cccccc');
    const allIds = api.allObjectIds();
    api.colorize(allIds, neutral);
    const present = new Set(allIds);
    const matchedIds = new Set<string>();
    colorById.forEach((rgb, gid) => {
      const leaves = api.expandToLeaves(gid).filter(id => present.has(id));
      if (leaves.length) {
        api.colorize(leaves, rgb);
        leaves.forEach(id => matchedIds.add(id));
      }
    });
    setMatched({ m: matchedIds.size, n: colorById.size });
  }, [api, colorById, theme]);

  return (
    <Container style={{ width, height, background: backgroundColor }}>
      <div
        ref={containerRef}
        style={{ width, height }}
        data-test="bim-container"
      />
      {modelUrl && !loading && !error && api && (
        <ModelTree tree={tree} api={api} />
      )}
      {modelUrl && !loading && !error && api && <ColorLegend legend={legend} />}
      {matched && (
        <Diagnostic data-test="bim-diagnostic" data-testid="bim-diagnostic">
          {t('Matched %s of %s', matched.m, matched.n)}
        </Diagnostic>
      )}
      {!modelUrl && (
        <Center>{t('Select a model column with a model UUID.')}</Center>
      )}
      {modelUrl && loading && (
        <Center>
          <Loading />
        </Center>
      )}
      {modelUrl && error && (
        <Center>
          <Alert
            type="error"
            showIcon
            closable={false}
            description={error}
            action={
              <Button
                buttonSize="small"
                onClick={() => setRetryKey(k => k + 1)}
              >
                {t('Retry')}
              </Button>
            }
          >
            {t('File storage is currently unavailable.')}
          </Alert>
        </Center>
      )}
    </Container>
  );
}
