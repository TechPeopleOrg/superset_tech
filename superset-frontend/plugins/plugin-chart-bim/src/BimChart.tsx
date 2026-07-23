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
import {
  buildCrossFilterDataMask,
  selectedGlobalIdsFromFilterState,
} from './crossFilter';

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
    colorScheme,
    emitCrossFilters,
    setDataMask,
    filterState,
  } = props;
  const theme = useTheme();
  const containerRef = useRef<HTMLDivElement>(null);
  // Bump to force the hook effect to re-run on retry without changing modelUrl.
  const [retryKey, setRetryKey] = useState(0);

  const { loading, error, tree, api, ready } = useXeokitViewer(containerRef, {
    modelUrl: modelUrl ? `${modelUrl}#${retryKey}` : '',
    backgroundColor,
    showEdges,
    navMode,
  });

  // Content-based key for the color mapping. transformProps runs on every
  // chart re-render (resize, refresh, filter changes), not only when the
  // underlying data changes, and it hands back a new `colorFn` reference and
  // a new `overrides` array/reference each time even when their content is
  // identical. Keying the memo below off serialized content (rather than off
  // those references directly) means the mapping — and the paint effect that
  // depends on it — only recomputes when rows/linkColumn/colorBy/overrides
  // actually change, not on every re-render. `colorScheme` is included so a
  // dashboard-level palette change invalidates the key too: colorFn resolves
  // against the scheme but is intentionally excluded from the memo's deps
  // (see below), so without the scheme string here a scheme change would
  // leave stale colors on the model.
  const mappingKey = JSON.stringify({
    rows,
    linkColumn,
    colorBy,
    overrides,
    colorScheme,
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
    // mappingKey already encodes rows/linkColumn/colorBy/overrides/colorScheme
    // by content, so it is the only dependency that should trigger a
    // recompute. colorFn is deterministic for a given value and scheme
    // (backed by the shared categorical palette) and is intentionally
    // excluded: transformProps hands back a new colorFn/overrides reference
    // on every re-render, and depending on those references directly would
    // rebuild the mapping (and re-run the paint effect below) on every render
    // instead of only when the data or scheme changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mappingKey]);

  const [matched, setMatched] = useState<{ m: number; n: number } | null>(null);

  // Paint the scene whenever the mapping or the live api changes: reset to a
  // neutral base (so unmatched elements read as "no data"), then paint every
  // matched GlobalId's geometry leaves with its mapped color.
  useEffect(() => {
    if (!api || !ready || !colorById.size) {
      setMatched(null);
      return;
    }
    api.resetColors();
    const neutral = hexToRgb01(theme.colorFillSecondary ?? '#cccccc');
    const allIds = api.allObjectIds();
    api.colorize(allIds, neutral);
    const present = new Set(allIds);
    // Diagnostic counts data keys, not geometry leaves: a single container
    // GlobalId (e.g. a storey) can expand into many leaves, and counting
    // leaves for `m` while `n` counts data keys produces a nonsensical
    // "Matched 50 of 1". Counting a data key as matched once it has at least
    // one present leaf keeps m <= n and reports something a user can reason
    // about ("this many of my rows landed on the model").
    let matchedKeys = 0;
    colorById.forEach((rgb, gid) => {
      const leaves = api.expandToLeaves(gid).filter(id => present.has(id));
      if (leaves.length) {
        api.colorize(leaves, rgb);
        matchedKeys += 1;
      }
    });
    setMatched({ m: matchedKeys, n: colorById.size });
  }, [api, colorById, theme, ready]);

  // Current single selection, kept outside React state so the outgoing pick
  // handler (closed over once per api/ready/linkColumn combination) can read
  // the latest value for the toggle-off comparison without re-subscribing.
  const selectedRef = useRef<string | null>(null);

  // Outgoing: clicking an element emits a cross-filter (or, when
  // cross-filtering is disabled, highlights locally instead). Single-select:
  // clicking the currently-selected element or empty space clears it.
  useEffect(() => {
    if (!api || !ready || !linkColumn) return undefined;
    const unsubscribe = api.onPick(gid => {
      const next = gid && gid !== selectedRef.current ? gid : null;
      selectedRef.current = next;
      if (emitCrossFilters) {
        setDataMask(buildCrossFilterDataMask(linkColumn, next));
      } else {
        // No round-trip through filterState in this mode: highlight locally.
        api.highlight(next ? [next] : []);
      }
    });
    return unsubscribe;
  }, [api, ready, linkColumn, emitCrossFilters, setDataMask]);

  // Incoming: when cross-filtering is on, highlight follows filterState —
  // the source of truth, since the click's own selection round-trips back
  // through Superset into filterState. When cross-filtering is off, this
  // effect is inert; the outgoing handler above covers local highlight.
  const incomingIds = emitCrossFilters
    ? selectedGlobalIdsFromFilterState(filterState)
    : null;
  const incomingKey = JSON.stringify(incomingIds);
  useEffect(() => {
    // This effect syncs the scene highlight to an external system (the
    // dashboard's filterState), not to a local component event, so the
    // guard clause below is not the "effect as event handler" anti-pattern
    // the no-event-handler rule targets — its heuristic cannot distinguish
    // the two, so it is disabled for this line specifically.
    // eslint-disable-next-line react-you-might-not-need-an-effect/no-event-handler
    if (!api || !ready || incomingIds === null) return;
    api.highlight(incomingIds);
    // Keep the ref in sync so a toggle-off click compares against what's shown.
    selectedRef.current = incomingIds[0] ?? null;
    // incomingKey encodes incomingIds by content; api/ready gate scene access.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [api, ready, incomingKey]);

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
